import { eq, desc, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { InsertUser, users, reservations, funnelEvents, InsertReservation } from "../drizzle/schema";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(postgres(process.env.DATABASE_URL));
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onConflictDoUpdate({
      target: users.openId,
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

/**
 * Rastreamento de funil
 */
export async function trackFunnelEvent(
  eventType: 'page_visit' | 'checkout_opened' | 'payment_confirmed',
  sessionId: string
) {
  const db = await getDb();
  if (!db) return;

  try {
    await db.insert(funnelEvents).values({
      eventType,
      sessionId,
    });
  } catch (error) {
    console.error('[Database] Failed to track event:', error);
  }
}

/**
 * Obter métricas de funil
 */
export async function getFunnelMetrics() {
  const db = await getDb();
  if (!db) return null;

  try {
    const result = await db.execute(
      'SELECT event_type, COUNT(DISTINCT session_id) as count FROM funnel_events GROUP BY event_type'
    );
    return (result as unknown as Array<{ event_type: string; count: number }>);
  } catch (error) {
    console.error('[Database] Failed to get funnel metrics:', error);
    return null;
  }
}

/**
 * Salvar reserva
 */
export async function saveReservation(data: InsertReservation) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  try {
    const result = await db.insert(reservations).values(data);
    return result;
  } catch (error) {
    console.error('[Database] Failed to save reservation:', error);
    throw error;
  }
}

/**
 * Obter todas as reservas (para painel admin)
 */
export async function getAllReservations() {
  const db = await getDb();
  if (!db) return [];

  try {
    const result = await db.select().from(reservations).orderBy(desc(reservations.createdAt));
    return result;
  } catch (error) {
    console.error('[Database] Failed to get reservations:', error);
    return [];
  }
}

/**
 * Obter reserva por external_id
 */
export async function getReservationByExternalId(externalId: string) {
  const db = await getDb();
  if (!db) return null;

  try {
    const result = await db
      .select()
      .from(reservations)
      .where(eq(reservations.externalId, externalId))
      .limit(1);
    return result.length > 0 ? result[0] : null;
  } catch (error) {
    console.error('[Database] Failed to get reservation:', error);
    return null;
  }
}

/**
 * Atualizar status de reserva
 */
export async function updateReservationStatus(
  externalId: string,
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed',
  buckpayTransactionId?: string,
  buckpayStatus?: string
) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  try {
    await db
      .update(reservations)
      .set({
        status,
        buckpayTransactionId: buckpayTransactionId || undefined,
        buckpayStatus: buckpayStatus || undefined,
      })
      .where(eq(reservations.externalId, externalId));
  } catch (error) {
    console.error('[Database] Failed to update reservation:', error);
    throw error;
  }
}

export async function deleteReservation(externalId: string) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  try {
    await db.delete(reservations).where(eq(reservations.externalId, externalId));
  } catch (error) {
    console.error('[Database] Failed to delete reservation:', error);
    throw error;
  }
}

// TODO: add feature queries here as your schema grows.
