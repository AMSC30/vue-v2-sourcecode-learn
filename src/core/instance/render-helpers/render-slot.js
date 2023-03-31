/* @flow */

import { extend, warn, isObject } from "core/util/index";

export function renderSlot(name, fallback, props, bindObject) {
    const scopedSlotFn = this.$scopedSlots[name];
    let nodes;
    if (scopedSlotFn) {
        props = props || {};
        if (bindObject) {
            props = extend(extend({}, bindObject), props);
        }
        nodes = scopedSlotFn(props) || fallback;
    } else {
        nodes = this.$slots[name] || fallback;
    }

    const target = props && props.slot;
    if (target) {
        return this.$createElement("template", { slot: target }, nodes);
    } else {
        return nodes;
    }
}
