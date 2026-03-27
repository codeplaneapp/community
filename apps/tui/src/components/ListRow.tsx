import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { useTheme } from "../hooks/useTheme.js";
import { TextAttributes } from "../theme/tokens.js";

/**
 * Props for {@link ListRow}.
 */
export interface ListRowProps {
  /** Whether this row currently has keyboard focus. */
  focused: boolean;
  /** Whether this row is selected in multi-select mode. */
  selected?: boolean;
  /** Row content provided by the parent list render function. */
  children: ReactNode;
  /** Fixed row height in terminal rows. */
  height?: number;
}

const TEXT_ELEMENT_TYPES = new Set([
  "text",
  "span",
  "a",
  "b",
  "i",
  "u",
  "strong",
  "em",
]);

function applyAttributesToTextNodes(
  node: ReactNode,
  attributes: number,
): ReactNode {
  return Children.map(node, (child) => {
    if (!isValidElement(child)) {
      return child;
    }

    const element = child as ReactElement<{
      attributes?: number;
      children?: ReactNode;
    }>;
    const elementType =
      typeof element.type === "string" ? element.type : undefined;

    const clonedChildren = element.props.children
      ? applyAttributesToTextNodes(element.props.children, attributes)
      : element.props.children;

    let didChange = false;
    const nextProps: { attributes?: number; children?: ReactNode } = {};

    if (elementType && TEXT_ELEMENT_TYPES.has(elementType)) {
      const existingAttributes =
        typeof element.props.attributes === "number"
          ? element.props.attributes
          : 0;
      nextProps.attributes = existingAttributes | attributes;
      didChange = true;
    }

    if (clonedChildren !== element.props.children) {
      nextProps.children = clonedChildren;
      didChange = true;
    }

    if (!didChange) {
      return child;
    }

    return cloneElement(element, nextProps);
  });
}

/**
 * Single row wrapper for list views with focused and selected states.
 *
 * Focus styling applies reverse-video attributes to all text nodes in the
 * row subtree to ensure consistent ANSI-compatible highlighting.
 */
export function ListRow({
  focused,
  selected = false,
  children,
  height = 1,
}: ListRowProps) {
  const theme = useTheme();

  const content = focused
    ? applyAttributesToTextNodes(children, TextAttributes.REVERSE)
    : children;

  return (
    <box flexDirection="row" width="100%" height={height} paddingX={1}>
      <text
        fg={selected ? theme.primary : undefined}
        attributes={focused ? TextAttributes.REVERSE : undefined}
      >
        {selected ? "● " : "  "}
      </text>
      <box flexGrow={1} flexDirection="row">
        {content}
      </box>
    </box>
  );
}
