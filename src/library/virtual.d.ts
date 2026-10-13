// The library folder the Vite plugin chose, as folder-relative paths to file text.
declare module "virtual:riglab-library" {
  const library: { readonly label: string; readonly files: Readonly<Record<string, string>> };
  export default library;
}
