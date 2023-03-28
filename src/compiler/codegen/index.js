/* @flow */

import { genHandlers } from "./events";
import baseDirectives from "../directives/index";
import { camelize, no, extend } from "shared/util";
import { baseWarn, pluckModuleFunction } from "../helpers";
import { emptySlotScopeToken } from "../parser/index";

type TransformFunction = (el: ASTElement, code: string) => string;
type DataGenFunction = (el: ASTElement) => string;
type DirectiveFunction = (
    el: ASTElement,
    dir: ASTDirective,
    warn: Function
) => boolean;

export class CodegenState {
    constructor(options) {
        this.options = options;
        this.warn = options.warn || baseWarn;
        this.transforms = pluckModuleFunction(options.modules, "transformCode");
        this.dataGenFns = pluckModuleFunction(options.modules, "genData");
        this.directives = extend(
            extend({}, baseDirectives),
            options.directives
        );
        const isReservedTag = options.isReservedTag || no;
        this.maybeComponent = (el) => !!el.component || !isReservedTag(el.tag);
        this.onceId = 0;
        this.staticRenderFns = [];
        this.pre = false;
    }
}

export type CodegenResult = {
    render: string,
    staticRenderFns: Array<string>,
};

export function generate(ast, options) {
    const state = new CodegenState(options);
    const code = ast ? genElement(ast, state) : '_c("div")';
    return {
        render: `with(this){return ${code}}`,
        staticRenderFns: state.staticRenderFns,
    };
}

export function genElement(el, state) {
    if (el.parent) {
        el.pre = el.pre || el.parent.pre;
    }

    if (el.staticRoot && !el.staticProcessed) {
        return genStatic(el, state);
    } else if (el.once && !el.onceProcessed) {
        return genOnce(el, state);
    } else if (el.for && !el.forProcessed) {
        return genFor(el, state);
    } else if (el.if && !el.ifProcessed) {
        return genIf(el, state);
    } else if (el.tag === "template" && !el.slotTarget && !state.pre) {
        return genChildren(el, state) || "void 0";
    } else if (el.tag === "slot") {
        return genSlot(el, state);
    } else {
        let data = genData(el, state);

        const children = el.inlineTemplate
            ? null
            : genChildren(el, state, true);

        const tag = el.component ? el.component : el.tagName;

        let code = `_c('${tag}'${
            data ? `,${data}` : "" // data
        }${
            children ? `,${children}` : "" // children
        })`;

        // module transforms
        for (let i = 0; i < state.transforms.length; i++) {
            code = state.transforms[i](el, code);
        }
        return code;
    }
}

function genStatic(el, state) {
    el.staticProcessed = true;

    const originalPreState = state.pre;
    if (el.pre) {
        state.pre = el.pre;
    }
    state.staticRenderFns.push(`with(this){return ${genElement(el, state)}}`);
    state.pre = originalPreState;
    return `_m(`with(this){return ${genElement(el, state)}`${
        el.staticInFor ? ",true" : ""
    })`;
}

// v-once
function genOnce(el, state) {
    el.onceProcessed = true;
    if (el.if && !el.ifProcessed) {
        return genIf(el, state);
    } else if (el.staticInFor) {
        let key = "";
        let parent = el.parent;
        while (parent) {
            if (parent.for) {
                key = parent.key;
                break;
            }
            parent = parent.parent;
        }
        if (!key) {
            process.env.NODE_ENV !== "production" &&
                state.warn(
                    `v-once can only be used inside v-for that is keyed. `,
                    el.rawAttrsMap["v-once"]
                );
            return genElement(el, state);
        }
        return `_o(${genElement(el, state)},${state.onceId++},${key})`;
    } else {
        return genStatic(el, state);
    }
}

export function genIf(el, state, altGen, altEmpty) {
    el.ifProcessed = true;
    return genIfConditions(el.ifConditions.slice(), state, altGen, altEmpty);
}

function genIfConditions(conditions, state, altGen, altEmpty) {
    if (!conditions.length) {
        return altEmpty || "_e()";
    }

    const condition = conditions.shift();
    return condition.exp
        ? `(${condition.exp})?${genElement(
              condition.block
          )}:${genIfConditions(conditions, state, altGen, altEmpty)}`
        : `${genTernaryExp(condition.block)}`;

    // v-if with v-once should generate code like (a)?_m(0):_m(1)
    function genTernaryExp(el) {
        return altGen
            ? altGen(el, state)
            : el.once
            ? genOnce(el, state)
            : genElement(el, state);
    }
}

export function genFor(el, state, altGen, altHelper) {
    const exp = el.for;
    const alias = el.alias;
    const iterator1 = el.iterator1 ? `,${el.iterator1}` : "";
    const iterator2 = el.iterator2 ? `,${el.iterator2}` : "";

    if (
        process.env.NODE_ENV !== "production" &&
        state.maybeComponent(el) &&
        el.tag !== "slot" &&
        el.tag !== "template" &&
        !el.key
    ) {
        state.warn(
            `<${el.tag} v-for="${alias} in ${exp}">: component lists rendered with ` +
                `v-for should have explicit keys. ` +
                `See https://vuejs.org/guide/list.html#key for more info.`,
            el.rawAttrsMap["v-for"],
            true /* tip */
        );
    }

    el.forProcessed = true; // avoid recursion
    return (
        `"_l"((${exp}),` +
        `function(${alias}${iterator1}${iterator2}){` +
        `return ${genElement(el, state)}` +
        "})"
    );
}

export function genData(el, state) {
    /**
     * data:
     * {
     *  directives:[{name:"",value:"",expression:"",arg:"",modifiers:""}],
     *  key: el.key
     *  ref: el.ref
     *  refInFor: true | false
     *  pre: true | false
     *  tag: el.tag
     *  staticClass:el.staticClass
     *  class: el.classBinding
     *  staticStyle: el.staticStyle
     *  style: el.styleBinding
     *  attrs:{}
     *  domProps:{}
     *  on:{}
     *  nativeOn:{}
     *  slot: el.slotTarget
     *  scopedSlots:[]
     *  model:{
     *      value: el.model.value,
     *      expressions:el.model.expressions,
     *      callback: el.model.callback
     *  }
     * }
     */
    let data = "{";

    const dirs = genDirectives(el, state);
    if (dirs) data += dirs + ",";

    if (el.key) {
        data += `key:${el.key},`;
    }
    if (el.ref) {
        data += `ref:${el.ref},`;
    }
    if (el.refInFor) {
        data += `refInFor:true,`;
    }
    // pre
    if (el.pre) {
        data += `pre:true,`;
    }
    // record original tag name for components using "is" attribute
    if (el.component) {
        data += `tag:"${el.tag}",`;
    }
    // 处理class=  class=  :style=  style=
    for (let i = 0; i < state.dataGenFns.length; i++) {
        data += state.dataGenFns[i](el);
    }

    // attributes
    if (el.attrs) {
        data += `attrs:${genProps(el.attrs)},`;
    }
    // DOM props
    if (el.props) {
        data += `domProps:${genProps(el.props)},`;
    }
    // event handlers
    if (el.events) {
        data += `${genHandlers(el.events, false)},`;
    }
    if (el.nativeEvents) {
        data += `${genHandlers(el.nativeEvents, true)},`;
    }
    // slot target
    // only for non-scoped slots
    if (el.slotTarget && !el.slotScope) {
        data += `slot:${el.slotTarget},`;
    }
    // scoped slots
    if (el.scopedSlots) {
        data += `${genScopedSlots(el, el.scopedSlots, state)},`;
    }
    // component v-model
    if (el.model) {
        const model = el.model.value
        data += `model:{value:${model.value},callback:${model.callback},expression:${model.expression}},`;
    }
    // inline-template
    if (el.inlineTemplate) {
        const inlineTemplate = genInlineTemplate(el, state);
        if (inlineTemplate) {
            data += `${inlineTemplate},`;
        }
    }

    data = data.replace(/,$/, "") + "}";
    // v-bind dynamic argument wrap
    // v-bind with dynamic arguments must be applied using the same v-bind object
    // merge helper so that class/style/mustUseProp attrs are handled correctly.
    if (el.dynamicAttrs) {
        data = `_b(${data},"${el.tag}",${genProps(el.dynamicAttrs)})`;
    }
    // v-bind data wrap
    if (el.wrapData) {
        // `_b(${code},'${el.tag}',${dir.value},${
        //     dir.modifiers && dir.modifiers.prop ? "true" : "false"
        // }${dir.modifiers && dir.modifiers.sync ? ",true" : ""})`;
        data = el.wrapData(data);
    }
    // v-on data wrap
    if (el.wrapListeners) {
        // `_g(${code},${dir.value})`
        data = el.wrapListeners(data);
    }
    return data;
}

function genDirectives(el, state): string | void {
    const dirs = el.directives;
    if (!dirs) return;

    let res = "directives:[";
    let hasRuntime = false;
    let i, l, dir, needRuntime;

    for (i = 0, l = dirs.length; i < l; i++) {
        dir = dirs[i];
        needRuntime = true;
        const gen = state.directives[dir.name];

        if (gen) {
            needRuntime = !!gen(el, dir, state.warn);
        }

        if (needRuntime) {
            hasRuntime = true;
            res += `{
                name:"${dir.name}",
                rawName:"${dir.rawName}"${
                dir.value
                    ? `,
                value:(${dir.value}),
                expression:${JSON.stringify(dir.value)}`
                    : ""
            }${
                dir.arg
                    ? `,arg:${dir.isDynamicArg ? dir.arg : `"${dir.arg}"`}`
                    : ""
            }${
                dir.modifiers
                    ? `,modifiers:${JSON.stringify(dir.modifiers)}`
                    : ""
            }},`;
        }
    }
    if (hasRuntime) {
        return res.slice(0, -1) + "]";
    }
}

function genInlineTemplate(el: ASTElement, state: CodegenState): ?string {
    const ast = el.children[0];
    if (
        process.env.NODE_ENV !== "production" &&
        (el.children.length !== 1 || ast.type !== 1)
    ) {
        state.warn(
            "Inline-template components must have exactly one child element.",
            { start: el.start }
        );
    }
    if (ast && ast.type === 1) {
        const inlineRenderFns = generate(ast, state.options);
        return `inlineTemplate:{render:function(){${
            inlineRenderFns.render
        }},staticRenderFns:[${inlineRenderFns.staticRenderFns
            .map((code) => `function(){${code}}`)
            .join(",")}]}`;
    }
}

function genScopedSlots(el, slots, state) {

    let needsForceUpdate =
        el.for ||
        Object.keys(slots).some((key) => {
            const slot = slots[key];
            return (
                slot.slotTargetDynamic ||
                slot.if ||
                slot.for ||
                containsSlotChild(slot) // is passing down slot from parent which may be dynamic
            );
        });

    // #9534: if a component with scoped slots is inside a conditional branch,
    // it's possible for the same component to be reused but with different
    // compiled slot content. To avoid that, we generate a unique key based on
    // the generated code of all the slot contents.
    let needsKey = !!el.if;

    // OR when it is inside another scoped slot or v-for (the reactivity may be
    // disconnected due to the intermediate scope variable)
    // #9438, #9506
    // TODO: this can be further optimized by properly analyzing in-scope bindings
    // and skip force updating ones that do not actually use scope variables.
    if (!needsForceUpdate) {
        let parent = el.parent;
        while (parent) {
            if (
                (parent.slotScope &&
                    parent.slotScope !== emptySlotScopeToken) ||
                parent.for
            ) {
                needsForceUpdate = true;
                break;
            }
            if (parent.if) {
                needsKey = true;
            }
            parent = parent.parent;
        }
    }

    const generatedSlots = Object.keys(slots)
        .map((key) => genScopedSlot(slots[key], state))
        .join(",");

    // generatedSlots:
    // {key:slotTarget, fn: (slotScope)=>genElement(el),proxy:true},{}
    return `scopedSlots:_u([${generatedSlots}]${
        needsForceUpdate ? `,null,true` : ``
    }${
        !needsForceUpdate && needsKey
            ? `,null,false,${hash(generatedSlots)}`
            : ``
    })`;
}

function hash(str) {
    let hash = 5381;
    let i = str.length;
    while (i) {
        hash = (hash * 33) ^ str.charCodeAt(--i);
    }
    return hash >>> 0;
}

function containsSlotChild(el: ASTNode): boolean {
    if (el.type === 1) {
        if (el.tag === "slot") {
            return true;
        }
        return el.children.some(containsSlotChild);
    }
    return false;
}

function genScopedSlot(el , state) {
    const isLegacySyntax = el.attrsMap["slot-scope"];
    if (el.if && !el.ifProcessed && !isLegacySyntax) {
        return genIf(el, state, genScopedSlot, `null`);
    }
    if (el.for && !el.forProcessed) {
        return genFor(el, state, genScopedSlot);
    }
    const slotScope =
        el.slotScope === emptySlotScopeToken ? `` : String(el.slotScope);
    const fn =
        `function(${slotScope}){` +
        `return ${
            el.tag === "template"
                ? el.if && isLegacySyntax
                    ? `(${el.if})?${
                          genChildren(el, state) || "undefined"
                      }:undefined`
                    : genChildren(el, state) || "undefined"
                : genElement(el, state)
        }}`;
    // reverse proxy v-slot without scope on this.$slots
    const reverseProxy = slotScope ? `` : `,proxy:true`;
    return `{key:${el.slotTarget || `"default"`},fn:${fn}${reverseProxy}}`;
}

export function genChildren(el, state, checkSkip, altGenElement, altGenNode) {
    const children = el.children;

    if (!children.length) return;

    const el = children[0];
    if (
        children.length === 1 &&
        el.for &&
        el.tag !== "template" &&
        el.tag !== "slot"
    ) {
        const normalizationType = checkSkip
            ? state.maybeComponent(el)
                ? `,1`
                : `,0`
            : ``;
        return `${genElement(
            el,
            state
        )}${normalizationType}`;
    }
    const normalizationType = checkSkip
        ? getNormalizationType(children, state.maybeComponent)
        : 0;
    return `[${children.map((c) => genNode(c, state)).join(",")}]${
        normalizationType ? `,${normalizationType}` : ""
    }`;
}

// determine the normalization needed for the children array.
// 0: no normalization needed
// 1: simple normalization needed (possible 1-level deep nested array)
// 2: full normalization needed
function getNormalizationType(
    children: Array<ASTNode>,
    maybeComponent: (el: ASTElement) => boolean
): number {
    let res = 0;
    for (let i = 0; i < children.length; i++) {
        const el: ASTNode = children[i];
        if (el.type !== 1) {
            continue;
        }
        if (
            needsNormalization(el) ||
            (el.ifConditions &&
                el.ifConditions.some((c) => needsNormalization(c.block)))
        ) {
            res = 2;
            break;
        }
        if (
            maybeComponent(el) ||
            (el.ifConditions &&
                el.ifConditions.some((c) => maybeComponent(c.block)))
        ) {
            res = 1;
        }
    }
    return res;
}

function needsNormalization(el: ASTElement): boolean {
    return el.for !== undefined || el.tag === "template" || el.tag === "slot";
}

function genNode(node, state): string {
    if (node.type === 1) {
        return genElement(node, state);
    } else if (node.type === 3 && node.isComment) {
        return genComment(node);
    } else {
        return genText(node);
    }
}

export function genText(text: ASTText | ASTExpression): string {
    return `_v(${
        text.type === 2
            ? text.expression // no need for () because already wrapped in _s()
            : transformSpecialNewlines(JSON.stringify(text.text))
    })`;
}

export function genComment(comment: ASTText): string {
    return `_e(${JSON.stringify(comment.text)})`;
}

function genSlot(el, state) {
    const slotName = el.slotName || '"default"';
    const children = genChildren(el, state);
    let res = `_t(${slotName}${children ? `,${children}` : ""}`;
    const attrs =
        el.attrs || el.dynamicAttrs
            ? genProps(
                  (el.attrs || [])
                      .concat(el.dynamicAttrs || [])
                      .map((attr) => ({
                          // slot props are camelized
                          name: camelize(attr.name),
                          value: attr.value,
                          dynamic: attr.dynamic,
                      }))
              )
            : null;
    const bind = el.attrsMap["v-bind"];
    if ((attrs || bind) && !children) {
        res += `,null`;
    }
    if (attrs) {
        res += `,${attrs}`;
    }
    if (bind) {
        res += `${attrs ? "" : ",null"},${bind}`;
    }
    // "_t('slotName',children | null,attrs,bind)"
    return res + ")";
}

// componentName is el.component, take it as argument to shun flow's pessimistic refinement
function genComponent(componentName, el, state) {
    const children = el.inlineTemplate ? null : genChildren(el, state, true);
    return `_c(${componentName},${genData(el, state)}${
        children ? `,${children}` : ""
    })`;
}

function genProps(props) {
    let staticProps = ``;
    let dynamicProps = ``;
    for (let i = 0; i < props.length; i++) {
        const prop = props[i];
        const value = transformSpecialNewlines(prop.value);
        if (prop.dynamic) {
            dynamicProps += `${prop.name},${value},`;
        } else {
            staticProps += `"${prop.name}":${value},`;
        }
    }
    staticProps = `{${staticProps.slice(0, -1)}}`;
    if (dynamicProps) {
        return `_d(${staticProps},[${dynamicProps.slice(0, -1)}])`;
    } else {
        return staticProps;
    }
}

function generateValue(value) {
    if (typeof value === "string") {
        return transformSpecialNewlines(value);
    }
    return JSON.stringify(value);
}

function transformSpecialNewlines(text: string): string {
    return text.replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}
