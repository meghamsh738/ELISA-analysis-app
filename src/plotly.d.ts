declare module 'plotly.js-basic-dist-min' {
  const Plotly: {
    react(
      element: HTMLElement,
      data: Record<string, unknown>[],
      layout: Record<string, unknown>,
      config?: Record<string, unknown>,
    ): Promise<HTMLElement>
    toImage(
      element: HTMLElement,
      options: { format: 'png' | 'svg'; width: number; height: number },
    ): Promise<string>
    relayout(
      element: HTMLElement,
      layout: Record<string, unknown>,
    ): Promise<HTMLElement>
    purge(element: HTMLElement): void
    Plots: { resize(element: HTMLElement): Promise<void> }
  }
  export default Plotly
}
