declare module 'virtual:player-bundle' {
  /** The compiled reader runtime (IIFE), inlined into exported books. */
  export const playerJs: string;
  /** The reader runtime's stylesheet. */
  export const playerCss: string;
}

declare module '*.woff2?url' {
  const url: string;
  export default url;
}
