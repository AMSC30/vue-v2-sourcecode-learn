/* @flow */

import { warn, cached } from "core/util/index";

import Vue from "./runtime/index"; // 引入构造函数
import { query } from "./util/index";
import { compileToFunctions } from "./compiler/index";
import {
    shouldDecodeNewlines,
    shouldDecodeNewlinesForHref,
} from "./util/compat";

const idToTemplate = cached((id) => {
    const el = query(id);
    return el && el.innerHTML;
});

const mount = Vue.prototype.$mount; // 保存core中定义得mount方法

Vue.prototype.$mount = function (el, hydrating) {
    el = el && query(el);

    const options = this.$options;

    // 优先级：render>template>el
    if (!options.render) {
        // 获取实例的template属性
        let template = options.template;

        // template有三种形式，id选择器、dom元素、html字符串
        if (template) {
            // 不是html字符串时的转换
            if (typeof template === "string") {
                // id选择器
                if (template.charAt(0) === "#") {
                    template = idToTemplate(template);
                }
            } else if (template.nodeType) {
                // dom元素
                template = template.innerHTML;
            } else {
                if (process.env.NODE_ENV !== "production") {
                    warn("invalid template option:" + template, this);
                }
                return this;
            }
        } else if (el) {
            template = getOuterHTML(el);
        }

        // 生成render函数
        if (template) {
            const { render, staticRenderFns } = compileToFunctions(
                template,
                {
                    outputSourceRange: process.env.NODE_ENV !== "production",
                    shouldDecodeNewlines,
                    shouldDecodeNewlinesForHref,
                    delimiters: options.delimiters,
                    comments: options.comments,
                },
                this
            );
            options.render = render;
            options.staticRenderFns = staticRenderFns;
        }
    }
    return mount.call(this, el, hydrating);
};

function getOuterHTML(el) {
    if (el.outerHTML) {
        return el.outerHTML;
    } else {
        const container = document.createElement("div");
        container.appendChild(el.cloneNode(true));
        return container.innerHTML;
    }
}

Vue.compile = compileToFunctions;

export default Vue;
