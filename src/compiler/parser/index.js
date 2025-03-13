/* @flow */

import he from "he";
import { parseHTML } from "./html-parser";
import { parseText } from "./text-parser";
import { parseFilters } from "./filter-parser";
import { genAssignmentCode } from "../directives/model";
import { extend, cached, no, camelize, hyphenate } from "shared/util";
import { isIE, isEdge, isServerRendering } from "core/util/env";

import {
    addProp,
    addAttr,
    baseWarn,
    addHandler,
    addDirective,
    getBindingAttr,
    getAndRemoveAttr,
    getRawBindingAttr,
    pluckModuleFunction,
    getAndRemoveAttrByRegex,
} from "../helpers";

export const onRE = /^@|^v-on:/;
export const dirRE = process.env.VBIND_PROP_SHORTHAND
    ? /^v-|^@|^:|^\.|^#/
    : /^v-|^@|^:|^#/;
export const forAliasRE = /([\s\S]*?)\s+(?:in|of)\s+([\s\S]*)/;
export const forIteratorRE = /,([^,\}\]]*)(?:,([^,\}\]]*))?$/;
const stripParensRE = /^\(|\)$/g;
const dynamicArgRE = /^\[.*\]$/;

const argRE = /:(.*)$/;
export const bindRE = /^:|^\.|^v-bind:/;
const propBindRE = /^\./;
const modifierRE = /\.[^.\]]+(?=[^\]]*$)/g;

const slotRE = /^v-slot(:|$)|^#/;

const lineBreakRE = /[\r\n]/;
const whitespaceRE = /\s+/g;

const invalidAttributeRE = /[\s"'<>\/=]/;

const decodeHTMLCached = cached(he.decode);

export const emptySlotScopeToken = `_empty_`;

// configurable state
export let warn: any;
let delimiters;
let transforms;
let preTransforms;
let postTransforms;
let platformIsPreTag;
let platformMustUseProp;
let platformGetTagNamespace;
let maybeComponent;

export function createASTElement(tag, attrs, parent) {
    return {
        type: 1,
        tag,
        attrsList: attrs,
        attrsMap: makeAttrsMap(attrs),
        rawAttrsMap: {},
        parent,
        children: [],
    };
}

function processPre(el) {
    if (getAndRemoveAttr(el, "v-pre") != null) {
        el.pre = true;
    }
}

function processRawAttrs(el) {
    const list = el.attrsList;
    const len = list.length;
    if (len) {
        const attrs = (el.attrs = new Array(len));
        for (let i = 0; i < len; i++) {
            attrs[i] = {
                name: list[i].name,
                value: JSON.stringify(list[i].value),
            };
            if (list[i].start != null) {
                attrs[i].start = list[i].start;
                attrs[i].end = list[i].end;
            }
        }
    } else if (!el.pre) {
        el.plain = true;
    }
}

export function processElement(element, options) {
    processKey(element); // element.key = exp

    element.plain =
        !element.key && !element.scopedSlots && !element.attrsList.length;

    processRef(element); // element.ref, element.refInFor

    processSlotContent(element); // element.slotTarget, element.slotTargetDynamic, element.slotScope
    processSlotOutlet(element); // element.slotName

    processComponent(element); // element.component, element['inline-template']
    for (let i = 0; i < transforms.length; i++) {
        element = transforms[i](element, options) || element;
    }

    processAttrs(element);
    return element;
}

function processKey(el) {
    const exp = getBindingAttr(el, "key");
    if (exp) {
        if (el.tag === "template") {
            warn(
                `<template> cannot be keyed. Place the key on real elements instead.`,
                getRawBindingAttr(el, "key")
            );
        }
        if (el.for) {
            const iterator = el.iterator2 || el.iterator1;
            const parent = el.parent;
            if (
                iterator &&
                iterator === exp &&
                parent &&
                parent.tag === "transition-group"
            ) {
                warn(
                    `Do not use v-for index as key on <transition-group> children, ` +
                        `this is the same as not using keys.`,
                    getRawBindingAttr(el, "key"),
                    true /* tip */
                );
            }
        }
        el.key = exp;
    }
}

function processRef(el) {
    const ref = getBindingAttr(el, "ref");
    if (ref) {
        el.ref = ref;
        el.refInFor = checkInFor(el);
    }
}

export function processFor(el) {
    let exp = getAndRemoveAttr(el, "v-for");
    if (exp) {
        const res = parseFor(exp);
        res && extend(el, res);
    }
}

type ForParseResult = {
    for: string,
    alias: string,
    iterator1?: string,
    iterator2?: string,
};

export function parseFor(exp) {
    //  "item of list"
    const inMatch = exp.match(forAliasRE);
    if (!inMatch) return;
    const res = {};

    res.for = inMatch[2].trim(); // list

    const alias = inMatch[1].trim().replace(stripParensRE, "");
    const iteratorMatch = alias.match(forIteratorRE);
    if (iteratorMatch) {
        res.alias = alias.replace(forIteratorRE, "").trim(); // item
        res.iterator1 = iteratorMatch[1].trim(); // of
        if (iteratorMatch[2]) {
            res.iterator2 = iteratorMatch[2].trim();
        }
    } else {
        res.alias = alias;
    }
    return res;
}

function processIf(el) {
    const exp = getAndRemoveAttr(el, "v-if");
    if (exp) {
        el.if = exp;
        addIfCondition(el, {
            exp: exp,
            block: el,
        });
    } else {
        if (getAndRemoveAttr(el, "v-else") != null) {
            el.else = true;
        }
        const elseif = getAndRemoveAttr(el, "v-else-if");
        if (elseif) {
            el.elseif = elseif;
        }
    }
}

function processIfConditions(el, parent) {
    const prev = findPrevElement(parent.children);
    if (prev && prev.if) {
        addIfCondition(prev, {
            exp: el.elseif,
            block: el,
        });
    }
}

function findPrevElement(children: Array<any>): ASTElement | void {
    let i = children.length;
    while (i--) {
        if (children[i].type === 1) {
            return children[i];
        } else {
            if (
                process.env.NODE_ENV !== "production" &&
                children[i].text !== " "
            ) {
                warn(
                    `text "${children[
                        i
                    ].text.trim()}" between v-if and v-else(-if) ` +
                        `will be ignored.`,
                    children[i]
                );
            }
            children.pop();
        }
    }
}

export function addIfCondition(el, condition) {
    if (!el.ifConditions) {
        el.ifConditions = [];
    }
    el.ifConditions.push(condition);
}

function processOnce(el) {
    const once = getAndRemoveAttr(el, "v-once");
    if (once != null) {
        el.once = true;
    }
}

function processSlotContent(el) {
    if (el.tag === "template") {
        // 以v-slot或者#开头的属性，取出{name:"v-slot:default",value:"data"}
        const slotBinding = getAndRemoveAttrByRegex(el, slotRE);
        if (slotBinding) {
            const { name, dynamic } = getSlotName(slotBinding);
            el.slotTarget = name;
            el.slotTargetDynamic = dynamic; // v-slot:[default]
            el.slotScope = slotBinding.value || emptySlotScopeToken;
        }
    } else {
        // v-slot on component, denotes default slot 取出{name:"v-slot:default",value:"data"}
        const slotBinding = getAndRemoveAttrByRegex(el, slotRE);
        if (slotBinding) {
            // add the component's children to its default slot
            /**
             * el:
             * {
             *   scopedSlots:{
             *      [name]:{
             *          tag:"template",
             *          children:[],
             *          parent:el,
             *      }
             *  }
             * }
             * */
            const slots = el.scopedSlots || (el.scopedSlots = {});
            const { name, dynamic } = getSlotName(slotBinding);
            const slotContainer = (slots[name] = createASTElement(
                "template",
                [],
                el
            ));
            slotContainer.slotTarget = name;
            slotContainer.slotTargetDynamic = dynamic;
            slotContainer.children = el.children.filter((c) => {
                if (!c.slotScope) {
                    c.parent = slotContainer;
                    return true;
                }
            });
            slotContainer.slotScope = slotBinding.value || emptySlotScopeToken;
            el.children = [];
            el.plain = false;
        }
    }
}

function getSlotName(binding) {
    let name = binding.name.replace(slotRE, "");
    if (!name) {
        if (binding.name[0] !== "#") {
            name = "default";
        } else if (process.env.NODE_ENV !== "production") {
            warn(`v-slot shorthand syntax requires a slot name.`, binding);
        }
    }
    return dynamicArgRE.test(name)
        ? // dynamic [name]
          { name: name.slice(1, -1), dynamic: true }
        : // static name
          { name: `"${name}"`, dynamic: false };
}

function processSlotOutlet(el) {
    if (el.tag === "slot") {
        el.slotName = getBindingAttr(el, "name");
        if (process.env.NODE_ENV !== "production" && el.key) {
            warn(
                `\`key\` does not work on <slot> because slots are abstract outlets ` +
                    `and can possibly expand into multiple elements. ` +
                    `Use the key on a wrapping element instead.`,
                getRawBindingAttr(el, "key")
            );
        }
    }
}

function processComponent(el) {
    let binding;
    if ((binding = getBindingAttr(el, "is"))) {
        el.component = binding;
    }
    if (getAndRemoveAttr(el, "inline-template") != null) {
        el.inlineTemplate = true;
    }
}

function processAttrs(el) {
    // attrs / props: 通过属性绑定的方式或者元素属性的方式
    // events / nativeEvents：通过带有sync的属性绑定或者事件监听的方式
    // directives: 通过指令的方式
    const list = el.attrsList;

    let i, l, name, rawName, value, modifiers, syncGen, isDynamic;
    for (i = 0, l = list.length; i < l; i++) {
        name = rawName = list[i].name;
        value = list[i].value;

        // 符合指令的格式
        if (dirRE.test(name)) {
            // 处理name和修饰符
            el.hasBindings = true;
            modifiers = parseModifiers(name.replace(dirRE, ""));

            if (process.env.VBIND_PROP_SHORTHAND && propBindRE.test(name)) {
                (modifiers || (modifiers = {})).prop = true;
                name = `.` + name.slice(1).replace(modifierRE, "");
            } else if (modifiers) {
                name = name.replace(modifierRE, "");
            }

            if (bindRE.test(name)) {
                name = name.replace(bindRE, "");
                value = parseFilters(value);
                isDynamic = dynamicArgRE.test(name); // [name]

                if (isDynamic) {
                    name = name.slice(1, -1);
                }

                if (modifiers) {
                    if (modifiers.prop && !isDynamic) {
                        name = camelize(name);
                        if (name === "innerHtml") name = "innerHTML";
                    }

                    if (modifiers.camel && !isDynamic) {
                        name = camelize(name);
                    }

                    if (modifiers.sync) {
                        syncGen = genAssignmentCode(value, `$event`);

                        if (!isDynamic) {
                            addHandler(
                                el,
                                `update:${camelize(name)}`,
                                syncGen,
                                null,
                                false,
                                warn,
                                list[i]
                            );
                            if (hyphenate(name) !== camelize(name)) {
                                addHandler(
                                    el,
                                    `update:${hyphenate(name)}`,
                                    syncGen,
                                    null,
                                    false,
                                    warn,
                                    list[i]
                                );
                            }
                        } else {
                            // handler w/ dynamic event name
                            addHandler(
                                el,
                                `"update:"+(${name})`,
                                syncGen,
                                null,
                                false,
                                warn,
                                list[i],
                                true // dynamic
                            );
                        }
                    }
                }

                if (
                    (modifiers && modifiers.prop) ||
                    (!el.component &&
                        platformMustUseProp(el.tag, el.attrsMap.type, name))
                ) {
                    addProp(el, name, value, list[i], isDynamic);
                } else {
                    addAttr(el, name, value, list[i], isDynamic);
                }
            } else if (onRE.test(name)) {
                name = name.replace(onRE, "");
                isDynamic = dynamicArgRE.test(name);
                if (isDynamic) {
                    name = name.slice(1, -1);
                }
                addHandler(
                    el,
                    name,
                    value,
                    modifiers,
                    false,
                    warn,
                    list[i],
                    isDynamic
                );
            } else {
                name = name.replace(dirRE, "");
                const argMatch = name.match(argRE);
                let arg = argMatch && argMatch[1];
                isDynamic = false;
                if (arg) {
                    name = name.slice(0, -(arg.length + 1));
                    if (dynamicArgRE.test(arg)) {
                        arg = arg.slice(1, -1);
                        isDynamic = true;
                    }
                }
                addDirective(
                    el,
                    name,
                    rawName,
                    value,
                    arg,
                    isDynamic,
                    modifiers,
                    list[i]
                );
                if (process.env.NODE_ENV !== "production" && name === "model") {
                    checkForAliasModel(el, value);
                }
            }
        } else {
            addAttr(el, name, JSON.stringify(value), list[i]);

            if (
                !el.component &&
                name === "muted" &&
                platformMustUseProp(el.tag, el.attrsMap.type, name)
            ) {
                addProp(el, name, "true", list[i]);
            }
        }
    }
}

function checkInFor(el) {
    let parent = el;
    while (parent) {
        if (parent.for !== undefined) {
            return true;
        }
        parent = parent.parent;
    }
    return false;
}

function parseModifiers(name) {
    const match = name.match(modifierRE);
    if (match) {
        const ret = {};
        match.forEach((m) => {
            ret[m.slice(1)] = true;
        });
        return ret;
    }
}

function makeAttrsMap(attrs) {
    const map = {};
    for (let i = 0, l = attrs.length; i < l; i++) {
        map[attrs[i].name] = attrs[i].value;
    }
    return map;
}

// for script (e.g. type="x/template") or style, do not decode content
function isTextTag(el): boolean {
    return el.tag === "script" || el.tag === "style";
}

function isForbiddenTag(el): boolean {
    return (
        el.tag === "style" ||
        (el.tag === "script" &&
            (!el.attrsMap.type || el.attrsMap.type === "text/javascript"))
    );
}

const ieNSBug = /^xmlns:NS\d+/;
const ieNSPrefix = /^NS\d+:/;

/* istanbul ignore next */
function guardIESVGBug(attrs) {
    const res = [];
    for (let i = 0; i < attrs.length; i++) {
        const attr = attrs[i];
        if (!ieNSBug.test(attr.name)) {
            attr.name = attr.name.replace(ieNSPrefix, "");
            res.push(attr);
        }
    }
    return res;
}

function checkForAliasModel(el, value) {
    let _el = el;
    while (_el) {
        if (_el.for && _el.alias === value) {
            warn(
                `<${el.tag} v-model="${value}">: ` +
                    `You are binding v-model directly to a v-for iteration alias. ` +
                    `This will not be able to modify the v-for source array because ` +
                    `writing to the alias is like modifying a function local variable. ` +
                    `Consider using an array of objects and use v-model on an object property instead.`,
                el.rawAttrsMap["v-model"]
            );
        }
        _el = _el.parent;
    }
}
export function parse(template, options) {
    warn = options.warn || baseWarn;

    platformIsPreTag = options.isPreTag || no;
    platformMustUseProp = options.mustUseProp || no;
    platformGetTagNamespace = options.getTagNamespace || no;
    const isReservedTag = options.isReservedTag || no;
    maybeComponent = (el) => !!el.component || !isReservedTag(el.tag);

    transforms = pluckModuleFunction(options.modules, "transformNode");
    preTransforms = pluckModuleFunction(options.modules, "preTransformNode");
    postTransforms = pluckModuleFunction(options.modules, "postTransformNode");

    delimiters = options.delimiters;

    const stack = [];
    const preserveWhitespace = options.preserveWhitespace !== false;
    const whitespaceOption = options.whitespace;
    let root;
    let currentParent;
    let inVPre = false;
    let inPre = false;
    let warned = false;

    function warnOnce(msg, range) {
        if (!warned) {
            warned = true;
            warn(msg, range);
        }
    }

    function closeElement(element) {
        if (!inPre) {
            // 清空空白子节点
            let lastNode = element.children[element.children.length - 1];
            while (lastNode && lastNode.type === 3 && lastNode.text === " ") {
                element.children.pop();
                lastNode = element.children[element.children.length - 1];
            }

            if (!element.processed) {
                processKey(element); // element.key = exp

                element.plain =
                    !element.key &&
                    !element.scopedSlots &&
                    !element.attrsList.length;

                processRef(element); // element.ref, element.refInFor

                // element.slotTarget, element.slotTargetDynamic, element.slotScope
                processSlotContent(element);

                processSlotOutlet(element); // element.slotName

                // element.component->componentIsExp, element['inline-template']
                processComponent(element);

                // 处理style与class
                for (let i = 0; i < transforms.length; i++) {
                    element = transforms[i](element, options) || element;
                }

                // 处理属性绑定、事件绑定、自定义指令
                processAttrs(element);
            }
        }

        if (!stack.length && element !== root) {
            // allow root elements with v-if, v-else-if and v-else
            if (root.if && (element.elseif || element.else)) {
                if (process.env.NODE_ENV !== "production") {
                    checkRootConstraints(element);
                }
                addIfCondition(root, {
                    exp: element.elseif,
                    block: element,
                });
            } else if (process.env.NODE_ENV !== "production") {
                warnOnce(
                    `Component template should contain exactly one root element. ` +
                        `If you are using v-if on multiple elements, ` +
                        `use v-else-if to chain them instead.`,
                    { start: element.start }
                );
            }
        }

        if (currentParent && !element.forbidden) {
            if (element.elseif || element.else) {
                // 将else、else-if添加到if元素的ifConditions中
                processIfConditions(element, currentParent);
            } else {
                if (element.slotScope) {
                    const name = element.slotTarget || '"default"';
                    (currentParent.scopedSlots ||
                        (currentParent.scopedSlots = {}))[name] = element;
                }
                currentParent.children.push(element);
                element.parent = currentParent;
            }
        }

        element.children = element.children.filter((c) => !c.slotScope);

        // remove trailing whitespace node again
        trimEndingWhitespace(element);

        // check pre state
        if (element.pre) {
            inVPre = false;
        }
        if (platformIsPreTag(element.tag)) {
            inPre = false;
        }
        // apply post-transforms
        for (let i = 0; i < postTransforms.length; i++) {
            postTransforms[i](element, options);
        }
    }

    function trimEndingWhitespace(el) {
        // remove trailing whitespace node
        if (!inPre) {
            let lastNode;
            while (
                (lastNode = el.children[el.children.length - 1]) &&
                lastNode.type === 3 &&
                lastNode.text === " "
            ) {
                el.children.pop();
            }
        }
    }

    function checkRootConstraints(el) {
        if (el.tag === "slot" || el.tag === "template") {
            warnOnce(
                `Cannot use <${el.tag}> as component root element because it may ` +
                    "contain multiple nodes.",
                { start: el.start }
            );
        }
        if (el.attrsMap.hasOwnProperty("v-for")) {
            warnOnce(
                "Cannot use v-for on stateful component root element because " +
                    "it renders multiple elements.",
                el.rawAttrsMap["v-for"]
            );
        }
    }

    parseHTML(template, {
        warn,
        expectHTML: options.expectHTML,
        isUnaryTag: options.isUnaryTag,
        canBeLeftOpenTag: options.canBeLeftOpenTag,
        shouldDecodeNewlines: options.shouldDecodeNewlines,
        shouldDecodeNewlinesForHref: options.shouldDecodeNewlinesForHref,
        shouldKeepComment: options.comments,
        outputSourceRange: options.outputSourceRange,
        start(tag, attrs, unary, start, end) {
            // 1. 创建ast节点
            // 2. 处理v-if、v-for、v-once

            // 创建AST节点
            let element = createASTElement(tag, attrs, currentParent);

            if (options.outputSourceRange) {
                element.start = start;
                element.end = end;
                element.rawAttrsMap = element.attrsList.reduce(
                    (cumulated, attr) => {
                        cumulated[attr.name] = attr;
                        return cumulated;
                    },
                    {}
                );
            }

            // 判断是否是style和script标签
            if (isForbiddenTag(element) && !isServerRendering()) {
                element.forbidden = true;
                process.env.NODE_ENV !== "production" &&
                    warn(
                        "Templates should only be responsible for mapping the state to the " +
                            "UI. Avoid placing tags with side-effects in your templates, such as " +
                            `<${tag}>` +
                            ", as they will not be parsed.",
                        { start: element.start }
                    );
            }

            for (let i = 0; i < preTransforms.length; i++) {
                element = preTransforms[i](element, options) || element;
            }

            // 是否使用了v-pre
            if (!inVPre) {
                processPre(element);
                if (element.pre) {
                    inVPre = true;
                }
            }
            // 是否是pre标签
            if (platformIsPreTag(element.tag)) {
                inPre = true;
            }

            // 处理v-if、v-for、v-once
            if (inVPre) {
                processRawAttrs(element);
            } else if (!element.processed) {
                // 添加el.alias, el.iterator1/el.iterator2, el.for
                processFor(element);
                // el.if=exp, el.else=true, el.elseif=exp, el.ifConditions->[{exp,block}]
                processIf(element);

                // el.once=true
                processOnce(element);
            }

            if (!root) {
                root = element;
            }

            if (!unary) {
                currentParent = element;
                stack.push(element);
            } else {
                closeElement(element);
            }
        },

        end(tag, start, end) {
            // 1. 在栈中获取到结束标签对应的ast节点
            // 2. 处理key属性 :key
            // 3. 处理ref属性 :ref
            // 4. 处理插槽 :v-slot
            // 5. 处理动态组件 :is
            // 6. 处理其余属性、事件、指令
            //  1）符合指令格式，按属性绑定(attrs,props)-事件绑定(events,nativeEvents)-自定义指令的顺序解析(directives)
            //  2）常规属性 如：type=“text”
            const element = stack[stack.length - 1];
            stack.length -= 1;
            currentParent = stack[stack.length - 1];
            if (
                process.env.NODE_ENV !== "production" &&
                options.outputSourceRange
            ) {
                element.end = end;
            }
            closeElement(element);
        },

        chars(text, start, end) {
            if (!currentParent) return;

            // 是textarea标签中的文本，直接忽略
            if (
                isIE &&
                currentParent.tag === "textarea" &&
                currentParent.attrsMap.placeholder === text
            ) {
                return;
            }

            const children = currentParent.children;
            if (inPre || text.trim()) {
                text = isTextTag(currentParent) ? text : decodeHTMLCached(text);
            } else if (!children.length) {
                text = "";
            } else if (whitespaceOption) {
                if (whitespaceOption === "condense") {
                    // in condense mode, remove the whitespace node if it contains
                    // line break, otherwise condense to a single space
                    text = lineBreakRE.test(text) ? "" : " ";
                } else {
                    text = " ";
                }
            } else {
                text = preserveWhitespace ? " " : "";
            }
            if (text) {
                if (!inPre && whitespaceOption === "condense") {
                    text = text.replace(whitespaceRE, " ");
                }
                // 插值表达式和过滤器
                /**
                 * res:
                 *
                 * hello {{ name | translate}} !
                 *
                 * {
                 *  expression:"hello"+"_s(translate(name))"+"!",
                 *  tokens:["hello",{ @binding: "_s(translate(name))"},"!"]
                 * }
                 *
                 * */
                let res = parseText(text, delimiters);
                let child;
                if (!inVPre && text !== " " && res) {
                    child = {
                        type: 2,
                        expression: res.expression,
                        tokens: res.tokens,
                        text,
                    };
                } else if (
                    text !== " " ||
                    !children.length ||
                    children[children.length - 1].text !== " "
                ) {
                    child = {
                        type: 3,
                        text,
                    };
                }
                if (child) {
                    if (
                        process.env.NODE_ENV !== "production" &&
                        options.outputSourceRange
                    ) {
                        child.start = start;
                        child.end = end;
                    }
                    children.push(child);
                }
            }
        },
        comment(text, start, end) {
            if (currentParent) {
                const child = {
                    type: 3,
                    text,
                    isComment: true,
                    start,
                    end,
                };
                currentParent.children.push(child);
            }
        },
    });
    return root;
}
