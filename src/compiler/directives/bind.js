/* @flow */

export default function bind(el: ASTElement, dir: ASTDirective) {
    el.wrapData = (code) => {
        return `_b(${code},'${el.tag}',${dir.value},${
            dir.modifiers && dir.modifiers.prop ? "true" : "false"
        }${dir.modifiers && dir.modifiers.sync ? ",true" : ""})`;
    };
}
