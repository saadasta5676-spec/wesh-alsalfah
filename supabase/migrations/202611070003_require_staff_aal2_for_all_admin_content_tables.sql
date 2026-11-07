-- Require AAL2 for every authenticated staff write/read surface.
-- Existing anonymous public read policies remain unaffected.
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['trends','article_trends','profiles','content_activity'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Staff require AAL2 for ' || tbl, tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (private.current_user_role() IS NULL OR private.current_user_role() NOT IN (''admin'',''editor'') OR (auth.jwt()->>''aal'') = ''aal2'') WITH CHECK (private.current_user_role() IS NULL OR private.current_user_role() NOT IN (''admin'',''editor'') OR (auth.jwt()->>''aal'') = ''aal2'')',
      'Staff require AAL2 for ' || tbl, tbl
    );
  END LOOP;
END $$;
