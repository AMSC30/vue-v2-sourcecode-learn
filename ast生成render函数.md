genStatic：

```javascript
 return `_m(`with(this){return ${genElement(el, state)}}`${
        el.staticInFor ? ",true" : ""
    })`;
```



genOnce:

```js
// with if
return genIf

// in for
return `_o(${genElement(el, state)},${state.onceId++},${key})`

// other
return genStatic
```



genFor:

```js
return (
        `_l((${exp}),` +
        `function(${alias}${iterator1}${iterator2}){` +
        `return ${genElement(el, state)}` +
        "})"
    );
```



genIf:
```js
    return `(${condition.exp})
    					?
    					${genElement(condition.block)}
    					:
              _e()`

    // v-if with v-once should generate code like (a)?_m(0):_m(1)
    function genTernaryExp(el) {
        return altGen
            ? altGen(el, state)
            : el.once
            ? genOnce(el, state)
            : genElement(el, state);
    }
```



genSlot:

```js
return "_t('slotName',children | null,attrs,bind)"
```



genText:

```js
 return `_v(${
        text.type === 2
            ? text.expression // no need for () because already wrapped in _s()
            : transformSpecialNewlines(JSON.stringify(text.text))
    })`;
// text.expression: "_s(filter2(filter1(el.text)))"
```



genComment:

```js
 return `_e(${JSON.stringify(comment.text)})`;
```



genChildren:

```js
 return `[${children.map((c) => genNode(c, state)).join(",")}]${
        normalizationType ? `,${normalizationType}` : ""
    }`;
```



genNode:

```js
function genNode(node, state): string {
    if (node.type === 1) {
        return genElement(node, state);
    } else if (node.type === 3 && node.isComment) {
        return genComment(node);
    } else {
        return genText(node);
    }
}

```



genData:

```js
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
     *  model:{value: el.model.value, expressions:el.model.expressions,callback: el.model.callback}
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
    // 处理:class=  class=  :style=  style=
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
        data += `model:{value:${el.model.value},callback:${el.model.callback},expression:${el.model.expression}},`;
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
```



genDirectives:

```js
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
```



genProps:

```js
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
```



genHandlers:

```js
 for (const name in events) {
        const handlerCode = genHandler(events[name]);
        if (events[name] && events[name].dynamic) {
            dynamicHandlers += `${name},${handlerCode},`;
        } else {
            staticHandlers += `"${name}":${handlerCode},`;
        }
    }
    staticHandlers = `{${staticHandlers.slice(0, -1)}}`;
    if (dynamicHandlers) {
        return (
            prefix + `_d(${staticHandlers},[${dynamicHandlers.slice(0, -1)}])`
        );
    } else {
        return prefix + staticHandlers;
    }
```



genHandler:

```js
 if (!handler) {
        return "function(){}";
    }

    if (Array.isArray(handler)) {
        return `[${handler.map((handler) => genHandler(handler)).join(",")}]`;
    }

    const isMethodPath = simplePathRE.test(handler.value);
    const isFunctionExpression = fnExpRE.test(handler.value);
    const isFunctionInvocation = simplePathRE.test(
        handler.value.replace(fnInvokeRE, "")
    );

    if (!handler.modifiers) {
        if (isMethodPath || isFunctionExpression) {
            return handler.value;
        }
        /* istanbul ignore if */
        if (__WEEX__ && handler.params) {
            return genWeexHandler(handler.params, handler.value);
        }
        return `function($event){${
            isFunctionInvocation ? `return ${handler.value}` : handler.value
        }}`; // inline statement
    } else {
        let code = "";
        let genModifierCode = "";
        const keys = [];
        for (const key in handler.modifiers) {
            if (modifierCode[key]) {
                genModifierCode += modifierCode[key];
                // left/right
                if (keyCodes[key]) {
                    keys.push(key);
                }
            } else if (key === "exact") {
                const modifiers: ASTModifiers = (handler.modifiers: any);
                genModifierCode += genGuard(
                    ["ctrl", "shift", "alt", "meta"]
                        .filter((keyModifier) => !modifiers[keyModifier])
                        .map((keyModifier) => `$event.${keyModifier}Key`)
                        .join("||")
                );
            } else {
                keys.push(key);
            }
        }
        if (keys.length) {
            code += genKeyFilter(keys);
        }
        // Make sure modifiers like prevent and stop get executed after key filtering
        if (genModifierCode) {
            code += genModifierCode;
        }
        const handlerCode = isMethodPath
            ? `return ${handler.value}($event)`
            : isFunctionExpression
            ? `return (${handler.value})($event)`
            : isFunctionInvocation
            ? `return ${handler.value}`
            : handler.value;
        /* istanbul ignore if */
        if (__WEEX__ && handler.params) {
            return genWeexHandler(handler.params, code + handlerCode);
        }
        return `function($event){${code}${handlerCode}}`;
```



genScopedSlots:

```js
 const generatedSlots = Object.keys(slots)
        .map((key) => genScopedSlot(slots[key], state))
        .join(",");
return `scopedSlots:_u([${generatedSlots}]${
        needsForceUpdate ? `,null,true` : ``
    }${
        !needsForceUpdate && needsKey
            ? `,null,false,${hash(generatedSlots)}`
            : ``
    })`;
```



genScopedSlot:

```js
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
```

