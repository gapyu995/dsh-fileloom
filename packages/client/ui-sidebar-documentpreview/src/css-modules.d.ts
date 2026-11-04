declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}

declare module '*.css'

declare module 'xlsx/dist/cpexcel.full.mjs' {
  const codepages: Record<string, unknown>
  export = codepages
}
