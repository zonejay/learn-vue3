const { effect, ref } = VueReactivity
function shouldSetAsProps(el, key, value) {
    // 特殊情况
    if (key === 'form' && el.tagName === 'INPUT') return false
    return key in el
}
function createRenderer(options) {
    const {
        createElement,
        insert,
        setElementText,
        patchProps
    } = options
    function mountElement(vnode, container) {
        const el = createElement(vnode.type)
        // 处理子节点 如果子节点是字符串 代表元素具有文本节点
        if (typeof vnode.children === 'string') {
            // 只需要设置元素的文本内容即可
            setElementText(el, vnode.children)
        } else if (Array.isArray(vnode.children)) {
            // 如果是数组 则遍历每一个节点 并调用patch函数挂载  
            vnode.children.forEach(child => {
                patch(null, child, el)
            })
        }
        // 处理元素属性
        if (vnode.props) {
            for (const key in vnode.props) {
                const value = vnode.props[key]
                patchProps(el, key, null, value)
            }
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
    type: 'div',
    props: {
        id: 'foo'
    },
    children: [
        {
            type: 'p',
            children: 'hello'
        },
        {
            type: 'button',
            props: {
                // 使用setAttribute设置属性值总是会字符串化
                disabled: false
            },
            children: 'click me'
        }
    ]
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
    },
    patchProps(el, key, prevValue, nextValue) {
        if (shouldSetAsProps(el, key, nextValue)) {
            // 获取该DOM Properties的类型
            const type = typeof el[key]
            // 如果是bool 并且value为空字符串 矫正为true
            if (type === 'boolean' && nextValue === '') {
                el[key] = true
            } else {
                el[key] = nextValue
            }
        } else {
            el.setAttribute(key, nextValue)
        }
    }
})

renderer.render(vnode, document.querySelector("#app"))
