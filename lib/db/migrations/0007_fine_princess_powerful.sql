CREATE TABLE IF NOT EXISTS "admin_prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"text" text NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"createdBy" uuid
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "admin_prompts" ADD CONSTRAINT "admin_prompts_createdBy_User_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
