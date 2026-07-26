CREATE TYPE "public"."funnel_event_type" AS ENUM('page_visit', 'checkout_opened', 'payment_confirmed');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('pending', 'confirmed', 'cancelled', 'completed');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "accommodation_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"price_per_night" integer NOT NULL,
	"amenities" text,
	"image_url" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "funnel_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_type" "funnel_event_type" NOT NULL,
	"session_id" varchar(64) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" serial PRIMARY KEY NOT NULL,
	"external_id" varchar(255) NOT NULL,
	"accommodation_id" integer NOT NULL,
	"guest_name" varchar(255) NOT NULL,
	"guest_email" varchar(320) NOT NULL,
	"guest_phone" varchar(20),
	"guest_cpf" varchar(14),
	"check_in_date" timestamp NOT NULL,
	"check_out_date" timestamp NOT NULL,
	"number_of_guests" integer NOT NULL,
	"observations" text,
	"booking_fee" integer NOT NULL,
	"status" "reservation_status" DEFAULT 'pending' NOT NULL,
	"buckpay_transaction_id" varchar(255),
	"buckpay_status" varchar(50),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "reservations_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" "role" DEFAULT 'user' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
