CREATE TABLE IF NOT EXISTS "master_prompts" (
	"id" serial PRIMARY KEY NOT NULL,
	"prompt_text" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- Seed the initial default master prompt
INSERT INTO "master_prompts" ("prompt_text") VALUES ('You are a helpful AI assistant. Please respond to the user''s request.');
