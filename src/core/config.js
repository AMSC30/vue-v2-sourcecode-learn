/* @flow */

import { no, noop, identity } from "shared/util";

import { LIFECYCLE_HOOKS } from "shared/constants";

export type Config = {
    // user
    optionMergeStrategies: { [key: string]: Function },
    silent: boolean,
    productionTip: boolean,
    performance: boolean,
    devtools: boolean,
    errorHandler: ?(err: Error, vm: Component, info: string) => void,
    warnHandler: ?(msg: string, vm: Component, trace: string) => void,
    ignoredElements: Array<string | RegExp>,
    keyCodes: { [key: string]: number | Array<number> },

    // platform
    isReservedTag: (x?: string) => boolean,
    isReservedAttr: (x?: string) => boolean,
    parsePlatformTagName: (x: string) => string,
    isUnknownElement: (x?: string) => boolean,
    getTagNamespace: (x?: string) => string | void,
    mustUseProp: (tag: string, type: ?string, name: string) => boolean,

    // private
    async: boolean,

    // legacy
    _lifecycleHooks: Array<string>,
};

export default {
    optionMergeStrategies: Object.create(null),

    silent: false,

    productionTip: process.env.NODE_ENV !== "production",

    devtools: process.env.NODE_ENV !== "production",

    performance: false,

    errorHandler: null,

    warnHandler: null,

    ignoredElements: [],

    keyCodes: Object.create(null),

    isReservedTag: no,

    isReservedAttr: no,

    isUnknownElement: no,

    getTagNamespace: noop,

    parsePlatformTagName: identity,

    mustUseProp: no,

    async: true,

    _lifecycleHooks: LIFECYCLE_HOOKS,
};
