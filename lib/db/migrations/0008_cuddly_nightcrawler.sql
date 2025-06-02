ALTER TABLE "Message_v2" ADD COLUMN "prompt_tokens" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "Message_v2" ADD COLUMN "completion_tokens" integer DEFAULT 0;