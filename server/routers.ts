import { config } from "dotenv";
config();
config({ path: ".env.local", override: true });
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { ADMIN_OPEN_ID, signAdminSession } from "./_core/session";
import { ENV } from "./_core/env";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import type { TrpcContext } from "./_core/context";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { timingSafeEqual } from "node:crypto";
import {
  trackFunnelEvent,
  getFunnelMetrics,
  saveReservation,
  getAllReservations,
  getReservationByExternalId,
  updateReservationStatus,
  deleteReservation,
  upsertUser,
} from "./db";

function passwordsMatch(candidate: string, expected: string): boolean {
  const candidateBuf = Buffer.from(candidate);
  const expectedBuf = Buffer.from(expected);
  if (candidateBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(candidateBuf, expectedBuf);
}

export const appRouter = router({
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    login: publicProcedure
      .input(z.object({ password: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        if (!ENV.adminPassword) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Admin login not configured",
          });
        }

        if (!passwordsMatch(input.password, ENV.adminPassword)) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Senha incorreta" });
        }

        await upsertUser({
          openId: ADMIN_OPEN_ID,
          role: "admin",
          lastSignedIn: new Date(),
        });

        const sessionToken = await signAdminSession();
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

        return { success: true } as const;
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  reservations: router({
    /**
     * Rastrear evento de funil (página visitada, checkout aberto, pagamento confirmado)
     */
    trackEvent: publicProcedure
      .input(z.object({
        eventType: z.enum(['page_visit', 'checkout_opened', 'payment_confirmed']),
        sessionId: z.string().min(1),
      }))
      .mutation(async ({ input }) => {
        await trackFunnelEvent(input.eventType, input.sessionId);
        return { success: true };
      }),

    /**
     * Salvar dados da reserva
     */
    create: publicProcedure
      .input(z.object({
        externalId: z.string().min(1),
        accommodationId: z.number(),
        guestName: z.string().min(1),
        guestEmail: z.string().email(),
        guestPhone: z.string().optional(),
        guestCpf: z.string().optional(),
        checkInDate: z.date(),
        checkOutDate: z.date(),
        numberOfGuests: z.number().min(1),
        guestsInfo: z.string().optional(),
        observations: z.string().optional(),
        bookingFee: z.number(),
      }))
      .mutation(async ({ input }) => {
        try {
          await saveReservation({
            ...input,
            status: 'pending',
          });
          return { success: true };
        } catch (error) {
          console.error('Failed to create reservation:', error);
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to create reservation',
          });
        }
      }),

    /**
     * Obter métricas de funil (apenas admin)
     */
    getFunnelMetrics: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        return await getFunnelMetrics();
      }),

    /**
     * Listar todas as reservas (apenas admin)
     */
    list: protectedProcedure
      .query(async ({ ctx }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        return await getAllReservations();
      }),

    /**
     * Obter reserva por external_id (apenas admin)
     */
    getByExternalId: protectedProcedure
      .input(z.string())
      .query(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        return await getReservationByExternalId(input);
      }),

    /**
     * Atualizar status de reserva (apenas admin)
     */
    updateStatus: protectedProcedure
      .input(z.object({
        externalId: z.string(),
        status: z.enum(['pending', 'confirmed', 'cancelled', 'completed']),
        buckpayTransactionId: z.string().optional(),
        buckpayStatus: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        try {
          await updateReservationStatus(
            input.externalId,
            input.status,
            input.buckpayTransactionId,
            input.buckpayStatus
          );
          return { success: true };
        } catch (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to update reservation status',
          });
        }
      }),

    /**
     * Excluir reserva (apenas admin)
     */
    delete: protectedProcedure
      .input(z.object({ externalId: z.string() }))
      .mutation(async ({ input, ctx }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        try {
          await deleteReservation(input.externalId);
          return { success: true };
        } catch (error) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to delete reservation',
          });
        }
      }),
  }),

  buckpay: router({
    /**
     * Criar transação PIX (backend seguro)
     */
    createTransaction: publicProcedure
      .input(z.object({
        externalId: z.string(),
        amount: z.number().min(600).max(300000),
        buyerName: z.string(),
        buyerEmail: z.string().email(),
        buyerCpf: z.string().optional(),
        buyerPhone: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        try {
          const BUCKPAY_TOKEN = process.env.BUCKPAY_TOKEN;
          if (!BUCKPAY_TOKEN) {
            throw new Error('BuckPay token not configured');
          }

          // A BuckPay espera document/phone só com dígitos (phone com DDI 55),
          // mas o formulário guarda os valores mascarados ("123.456.789-00",
          // "(11) 99999-9999") para exibição.
          const onlyDigits = (value?: string) => {
            const digits = value?.replace(/\D/g, '') ?? '';
            return digits.length > 0 ? digits : undefined;
          };
          const buyerDocument = onlyDigits(input.buyerCpf);
          const phoneDigits = onlyDigits(input.buyerPhone);
          const buyerPhone = phoneDigits
            ? (phoneDigits.startsWith('55') ? phoneDigits : `55${phoneDigits}`)
            : undefined;

          const payload = {
            external_id: input.externalId,
            payment_method: 'pix',
            amount: input.amount,
            buyer: {
              name: input.buyerName,
              email: input.buyerEmail,
              document: buyerDocument,
              phone: buyerPhone,
            },
            product: {
              name: 'Taxa de Agendamento - Resort Fazenda São João',
            },
          };

          console.log('[BuckPay] Sending Payload:', JSON.stringify(payload, null, 2));

          const response = await fetch('https://api.realtechdev.com.br/v1/transactions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${BUCKPAY_TOKEN}`,
              'Content-Type': 'application/json',
              'User-Agent': 'Buckpay API',
            },
            body: JSON.stringify({
              external_id: input.externalId,
              payment_method: 'pix',
              amount: input.amount,
              buyer: {
                name: input.buyerName,
                email: input.buyerEmail,
                document: buyerDocument,
                phone: buyerPhone,
              },
              product: {
                name: 'Taxa de Agendamento - Resort Fazenda São João',
              },
            }),
          });

          const responseText = await response.text();
          console.log(`[BuckPay] Response Status: ${response.status}`);
          console.log(`[BuckPay] Response Body: ${responseText}`);

          if (!response.ok) {
            throw new Error(`BuckPay API error: ${response.status} - ${responseText}`);
          }

          try {
            const data = JSON.parse(responseText);
            return data;
          } catch (e) {
            console.error('[BuckPay] Failed to parse JSON response:', e);
            throw new Error('Invalid JSON response from BuckPay');
          }
        } catch (error: any) {
          console.error('Failed to create BuckPay transaction:', error);
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: error.message || 'Failed to create transaction',
          });
        }
      }),

    /**
     * Consultar status de transação
     */
    getTransactionStatus: publicProcedure
      .input(z.string())
      .query(async ({ input }) => {
        try {
          const BUCKPAY_TOKEN = process.env.BUCKPAY_TOKEN;
          if (!BUCKPAY_TOKEN) {
            throw new Error('BuckPay token not configured');
          }

          const response = await fetch(
            `https://api.realtechdev.com.br/v1/transactions/external_id/${input}`,
            {
              headers: {
                'Authorization': `Bearer ${BUCKPAY_TOKEN}`,
                'User-Agent': 'Buckpay API',
              },
            }
          );

          if (!response.ok) {
            throw new Error(`BuckPay API error: ${response.status}`);
          }

          const data = await response.json();
          return data;
        } catch (error) {
          console.error('Failed to get transaction status:', error);
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to get transaction status',
          });
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
