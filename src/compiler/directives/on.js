/* @flow */

import { warn } from "core/util/index";

export default function on(el, dir) {
    el.wrapListeners = (code) => `_g(${code},${dir.value})`;
}
