-- owner: identity
-- reviewed: 2026-09-14
-- generated-by: drizzle-kit 1.0.0-rc.4
-- rationale: bind provider issuer and subject identifiers to global UserAccount records without granting tenant authority

CREATE TABLE "identity"."external_subject_mappings" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7(),
	"issuer" text NOT NULL,
	"subject" text NOT NULL,
	"user_account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "external_subject_mappings_issuer_subject_key" UNIQUE("issuer","subject"),
	CONSTRAINT "external_subject_mappings_issuer_check" CHECK ("issuer" = btrim("issuer") and "issuer" ~ '[^[:space:]]'),
	CONSTRAINT "external_subject_mappings_subject_check" CHECK ("subject" = btrim("subject") and "subject" ~ '[^[:space:]]')
);
--> statement-breakpoint
ALTER TABLE "identity"."external_subject_mappings" ADD CONSTRAINT "external_subject_mappings_user_account_id_fkey" FOREIGN KEY ("user_account_id") REFERENCES "identity"."user_accounts"("id") ON DELETE CASCADE;