import { Children, Fragment, isValidElement, type ReactNode } from "react";

/**
 * In v1's inline-flex Button/Badge, adjacent text (`{n} pending`) is one
 * anonymous flex item. React splits it into several string children; this
 * joins each run of strings/numbers into one piece rendered by `renderText`,
 * and passes elements through, so gap-* only separates icons from the label.
 */
export function withTextRuns(children: ReactNode, renderText: (text: string, key: number) => ReactNode): ReactNode[] {
  const out: ReactNode[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length) out.push(renderText(run.join(""), out.length));
    run = [];
  };
  Children.forEach(children, (child) => {
    if (typeof child === "string" || typeof child === "number") run.push(String(child));
    else if (isValidElement(child)) {
      flush();
      out.push(<Fragment key={out.length}>{child}</Fragment>);
    }
  });
  flush();
  return out;
}
