CREATE TABLE public.user_allowed_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  allowed_pages text[] NOT NULL,
  UNIQUE(user_id)
);

ALTER TABLE public.user_allowed_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own permissions"
  ON public.user_allowed_pages
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
