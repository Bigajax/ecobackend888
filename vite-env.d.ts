// vite-env.d.ts
/// <reference types="vite/client" />

declare module '*.txt' {
  const content: string;
  export default content;
}
