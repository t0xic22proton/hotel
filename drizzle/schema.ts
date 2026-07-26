import { integer, pgEnum, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["user", "admin"]);
export const reservationStatusEnum = pgEnum("reservation_status", ["pending", "confirmed", "cancelled", "completed"]);
export const funnelEventTypeEnum = pgEnum("funnel_event_type", ["page_visit", "checkout_opened", "payment_confirmed"]);

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = pgTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: serial("id").primaryKey(),
  /** Identificador único do usuário (ex.: "admin" para o painel administrativo). */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: roleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Tipos de acomodações disponíveis no resort
 */
export const accommodationTypes = pgTable("accommodation_types", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  pricePerNight: integer("price_per_night").notNull(), // em centavos
  amenities: text("amenities"), // JSON string
  imageUrl: text("image_url"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type AccommodationType = typeof accommodationTypes.$inferSelect;
export type InsertAccommodationType = typeof accommodationTypes.$inferInsert;

/**
 * Reservas de hóspedes
 */
export const reservations = pgTable("reservations", {
  id: serial("id").primaryKey(),
  externalId: varchar("external_id", { length: 255 }).notNull().unique(),
  accommodationId: integer("accommodation_id").notNull(),
  guestName: varchar("guest_name", { length: 255 }).notNull(),
  guestEmail: varchar("guest_email", { length: 320 }).notNull(),
  guestPhone: varchar("guest_phone", { length: 20 }),
  guestCpf: varchar("guest_cpf", { length: 14 }),
  checkInDate: timestamp("check_in_date").notNull(),
  checkOutDate: timestamp("check_out_date").notNull(),
  numberOfGuests: integer("number_of_guests").notNull(),
  observations: text("observations"),
  bookingFee: integer("booking_fee").notNull(), // em centavos, sempre 50000 (R$ 500,00)
  status: reservationStatusEnum("status").default("pending").notNull(),
  buckpayTransactionId: varchar("buckpay_transaction_id", { length: 255 }),
  buckpayStatus: varchar("buckpay_status", { length: 50 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type Reservation = typeof reservations.$inferSelect;
export type InsertReservation = typeof reservations.$inferInsert;

/**
 * Rastreamento de eventos do funil de conversão
 * Sem rastreamento de IP ou dados pessoais - apenas contadores anônimos
 */
export const funnelEvents = pgTable("funnel_events", {
  id: serial("id").primaryKey(),
  eventType: funnelEventTypeEnum("event_type").notNull(),
  sessionId: varchar("session_id", { length: 64 }).notNull(), // UUID anônimo por sessão
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type FunnelEvent = typeof funnelEvents.$inferSelect;
export type InsertFunnelEvent = typeof funnelEvents.$inferInsert;
