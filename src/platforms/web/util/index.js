/* @flow */

import { warn } from "core/util/index";

export * from "./attrs";
export * from "./class";
export * from "./element";

/**
 * Query an element selector if it's not an element already.
 */
export function query(el: string | Element): Element {
  if (typeof el === "string") {
    const selected = document.querySelector(el);
    // 没有根据选择器查询到元素则创建一个div元素并返回
    if (!selected) {
      process.env.NODE_ENV !== "production" &&
        warn("Cannot find element: " + el);
      return document.createElement("div");
    }
    return selected;
  } else {
    return el;
  }
}
