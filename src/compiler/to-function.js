/* @flow */

import { noop, extend } from "shared/util";
import { warn as baseWarn, tip } from "core/util/debug";
import { generateCodeFrame } from "./codeframe";

import { parse } from "./parser/index";
import { optimize } from "./optimizer";
import { generate } from "./codegen/index";

type CompiledFunctionResult = {
    render: Function,
    staticRenderFns: Array<Function>,
};

function createFunction(code, errors) {
    try {
        return new Function(code);
    } catch (err) {
        errors.push({ err, code });
        return noop;
    }
}
function compile(template, options) {
    const finalOptions = Object.create(baseOptions);
    const errors = [];
    const tips = [];

    let warn = (msg, range, tip) => {
        (tip ? tips : errors).push(msg);
    };

    if (options) {
        if (
            process.env.NODE_ENV !== "production" &&
            options.outputSourceRange
        ) {
            // $flow-disable-line
            const leadingSpaceLength = template.match(/^\s*/)[0].length;

            warn = (msg, range, tip) => {
                const data: WarningMessage = { msg };
                if (range) {
                    if (range.start != null) {
                        data.start = range.start + leadingSpaceLength;
                    }
                    if (range.end != null) {
                        data.end = range.end + leadingSpaceLength;
                    }
                }
                (tip ? tips : errors).push(data);
            };
        }
        // merge custom modules
        if (options.modules) {
            finalOptions.modules = (baseOptions.modules || []).concat(
                options.modules
            );
        }
        // merge custom directives
        if (options.directives) {
            finalOptions.directives = extend(
                Object.create(baseOptions.directives || null),
                options.directives
            );
        }
        // copy other options
        for (const key in options) {
            if (key !== "modules" && key !== "directives") {
                finalOptions[key] = options[key];
            }
        }
    }

    finalOptions.warn = warn;

    const compiled = baseCompile(template.trim(), finalOptions);
    if (process.env.NODE_ENV !== "production") {
        detectErrors(compiled.ast, warn);
    }
    compiled.errors = errors;
    compiled.tips = tips;
    return compiled;
}
export function createCompileToFunctionFn(compile) {
    const cache = Object.create(null);

    return function compileToFunctions(template, options, vm) {
        options = extend({}, options);
        const warn = options.warn || baseWarn;
        delete options.warn;

        const key = options.delimiters
            ? String(options.delimiters) + template
            : template;
        if (cache[key]) {
            return cache[key];
        }

        const ast = parse(template.trim(), options);
        if (options.optimize !== false) {
            optimize(ast, options);
        }
        const code = generate(ast, options);
        const compiled = {
            ast,
            render: code.render,
            staticRenderFns: code.staticRenderFns,
        };

        const res = {};
        const fnGenErrors = [];
        res.render = createFunction(compiled.render, fnGenErrors);
        res.staticRenderFns = compiled.staticRenderFns.map((code) => {
            return createFunction(code, fnGenErrors);
        });

        return (cache[key] = res);
    };
}
