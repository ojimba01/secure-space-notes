// The rules for what a document says live with the server's reader, so the
// browser and the scheduled reader in supabase/functions/document-reader can
// never read the same document two different ways. This is only the way in.
export * from '../../supabase/functions/_shared/documentFields';
