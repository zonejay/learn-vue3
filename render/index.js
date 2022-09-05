const { effect, ref } = VueReactivity
function createRenderer(options) {
    const {
        createElement,
        insert,
        setElementText
    } = options
    function mountElement(vnode, container) {
        const el = createElement(vnode.type)
        // 处理子节点 如果子节点是字符串 代表元素具有文本节点
        if (typeof vnode.children === 'string') {
            // 只需要设置元素的文本内容即可
            setElementText(el, vnode.children)
        }
        // 将元素添加到容器
        insert(el, container)
    }
    // n1 旧vnode
    // n2 新vnode
    function patch(n1, n2, container) {
        // 如果n1不存在 意味着挂载 则调用mountElement函数完成挂载
        if (!n1) {
            mountElement(n2, container)
        } else {
            // n1存在 则打补丁
        }
        console.log('patch function');
    }
    function render(vnode, container) {
        if (vnode) {
            // 新vnode存在 将其与旧vnode一起传递给patch函数 进行打补丁
            patch(container._vnode, vnode, container)
        } else {
            if (container._vnode) {
                // 旧vnode存在 且新vnode不存在 则是卸载操作
                // 清除container内的dom
                container.innerHTML = ''
            }
        }
        // 保存当前的vnode，在之后的使用中作为旧的vnode
        container._vnode = vnode
    }
    function hydrate(vnode, container) {

    }
    return { render, hydrate }
}

const vnode = {
    type: 'h1',
    children: 'hello'
}

const renderer = createRenderer({
    // 创建元素
    createElement(tag) {
        return document.createElement(tag)
    },
    // 设置文本节点
    setElementText(el, text) {
        el.textContent = text
    },
    // 在指定的parent下添加指定元素
    insert(el, parent, anchor = null) {
        parent.insertBefore(el, anchor)
    }
})

renderer.render(vnode, document.querySelector("#app"))
