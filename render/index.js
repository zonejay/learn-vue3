const { effect, ref } = VueReactivity
// 片段标识 多跟节点
const Fragment = Symbol()
// 文本节点标识
const Text = Symbol()
// 注释节点标识
const Comment = Symbol()
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
        patchProps,
        unmount,
        createText,
        setText,
        createComment,
        setComment
    } = options
    function patchElement(n1, n2) {
        const el = n2.el = n1.el
        console.log(n1, n2);
        const oldProps = n1.props
        const newProps = n2.props
        // 先更新props
        for (const key in newProps) {
            if (newProps[key] !== oldProps[key]) {
                patchProps(el, key, oldProps[key], newProps[key])
            }
        }
        for (const key in oldProps) {
            if (!(key in newProps)) {
                patchProps(el, key, oldProps[key], null)
            }
        }

        // 再更新children
        patchChildren(n1, n2, el)
    }
    function patchChildren(n1, n2, container) {
        // 判断新子节点的类型是否是文本节点
        if (typeof n2.children === 'string') {
            // 旧子节点的类型有三种可能： 没有子节点 文本子节点 以及一组子节点
            // 只有当旧子节点为一组子节点时 才需要逐个卸载 其他情况下什么都不需要做
            if (Array.isArray(n1.children)) {
                n1.children.forEach(child => unmount(child))
            }
            // 最后将新的文本节点内容设置给容器元素
            setElementText(container, n2.children)
        } else if (Array.isArray(n2.children)) {
            // 说明新子节点是一组子节点
            // 判断旧子节点是否也是一组子节点
            if (Array.isArray(n1.children)) {
                // 新旧子节点都是一组子节点的情况下 会比较新旧子节点，涉及到核心的diff算法
                // 先用笨方法替代
                // 将旧的一组子节点全部卸载
                n1.children.forEach(c => unmount(c))
                // 再将新的一组子节点全部挂载到容器中
                n2.children.forEach(c => patch(null, c, container))
            } else {
                // 旧子节点要么是文本子节点 要么不存在
                // 无论哪种情况 我们只需要将容器清空 然后将新的一组子节点逐个挂载
                setElementText(container, '')
                n2.children.forEach(c => patch(null, c, container))
            }
        } else {
            // 代码运行到这里 说明新子节点不存在
            // 旧子节点是一组子节点 只需逐个卸载即可
            if (Array.isArray(n1.children)) {
                n1.children.forEach(c => unmount(c))
            } else if (typeof n1.children === 'string') {
                // 旧子节点是文本节点 清空内容即可
                setElementText(container, '')
            }
            // 如果也没有旧子节点 什么都不需要做
        }
    }
    function mountElement(vnode, container) {
        // 让vnode.el引用真实DOM元素
        const el = vnode.el = createElement(vnode.type)
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
        // 不同类型的vnode之间打补丁没有意义
        if (n1 && n1.type !== n2.type) {
            // 直接卸载旧元素
            unmount(n1)
        }
        const { type } = n2
        // 如果为字符串，则描述的是普通标签
        if (typeof type === 'string') {
            console.log('string type');
            // 如果n1不存在 意味着挂载 则调用mountElement函数完成挂载
            if (!n1) {
                mountElement(n2, container)
            } else {
                // n1存在 则打补丁
                patchElement(n1, n2)
            }
        } else if (typeof type === 'object') {
            // 如果n2.type的值的类型是对象 则描述的是组件
        } else if (type === Text) {
            // 处理其他类型的vnode
            // 如果没有旧节点 则进行挂载
            if (!n1) {
                // 使用createTextNode创建文本节点
                const el = n2.el = createText(n2.children)
                // 将文本节点插入到容器中
                insert(el, container)
            } else {
                // 如果旧vnode存在 只需要使用新文本节点的文本内容更新旧文本节点即可
                const el = n2.el = n1.el
                if (n1.children !== n2.children) {
                    setText(el, n2.children)
                }
            }
        } else if (type === Comment) {
            // 处理其他类型的vnode
            // 如果没有旧节点 则进行挂载
            if (!n1) {
                const el = n2.el = createComment(n2.children)
                console.log(el);
                insert(el, container)
            } else {
                const el = n2.el = n1.el
                if (n1.children !== n2.children) {
                    setComment(el, n2.children)
                }
            }
        } else if (type === Fragment) {
            if (!n1) {
                // 如果旧vnode不存在 则只需要将Fragment的children逐个挂载即可
                n2.children.forEach(c => patch(null, c, container))
            } else {
                // 如果旧vnode存在 则只需要更新Fragment的children即可
                patchChildren(n1, n2, container)
            }
        }
    }
    function render(vnode, container) {
        if (vnode) {
            // 新vnode存在 将其与旧vnode一起传递给patch函数 进行打补丁
            patch(container._vnode, vnode, container)
        } else {
            if (container._vnode) {
                // 旧vnode存在 且新vnode不存在 则是卸载操作
                // 清除container内的dom
                // 根据vnode获取要卸载的真实DOM元素
                unmount(container._vnode)
                n1 = null
            }
        }
        // 保存当前的vnode，在之后的使用中作为旧的vnode
        container._vnode = vnode
    }
    function hydrate(vnode, container) {

    }
    return { render, hydrate }
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
        // 处理事件
        if (/^on/.test(key)) {
            // invoker为伪造的事件处理函数
            const invokers = el._vei || (el._vei = {})
            let invoker = invokers[key]
            // 获取事件名
            const name = key.slice(2).toLowerCase()
            if (nextValue) {
                if (!invoker) {
                    // 如果没有invoker 则将一个伪造的invoker缓存到el._vei
                    // vei是vue event invoker的首字母缩写
                    invoker = el._vei[key] = (e) => {
                        // e.timeStamp是事件发生的时间
                        // 如果事件发生的时间遭遇事件处理函数绑定的事件 则不执行事件处理函数
                        if (e.timeStamp < invoker.attached) return
                        // 绑定多个事件
                        if (Array.isArray(invoker.value)) {
                            invoker.value.forEach(fn => fn(e))
                        } else {
                            // 当伪造的事件处理函数执行时 会执行真正的事件处理函数
                            invoker.value(e)
                        }
                    }
                    // 添加invoker.attached属性 存储事件处理函数被绑定的时间
                    invoker.attached = performance.now()
                    // 将真正的事件处理函数赋值给invoker.value
                    invoker.value = nextValue
                    el.addEventListener(name, invoker)
                } else {
                    // 如果invoker存在 意味着更新 并且只需要更新invoker.value的值即可
                    invoker.value = nextValue
                }
            } else if (invoker) {
                // 新的事件绑定函数不存在 并且之前的invoker存在 则移除绑定
                el.removeEventListener(name, invoker)
            }
        } else if (key === 'class') {
            // 对class进行特殊处理
            // className 对比 classList 和 setAttribute性能最优
            el.className = nextValue || ''
        } else if (shouldSetAsProps(el, key, nextValue)) {
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
    },
    unmount(vnode) {
        const parent = vnode.el.parentNode
        // 在卸载时 如果卸载的vnode类型为Fragment 则需要卸载其children
        if (vnode.type === Fragment) {
            vnode.children.forEach(c => unmount(c))
        }
        if (parent) {
            parent.removeChild(vnode.el)
        }
    },
    createText(text) {
        return document.createTextNode(text)
    },
    setText(el, text) {
        el.nodeValue = text
    },
    createComment(comment) {
        return document.createComment(comment)
    },
    setComment(el, comment) {
        el.nodeValue = comment
    }
})



// renderer.render(vnode, document.querySelector("#app"))
// setTimeout(() => {
//     renderer.render(null, document.querySelector("#app"))
// }, 1000);

const bol = ref(false)

effect(() => {
    const vnode = {
        type: 'div',
        props: bol.value ? {
            onClick: () => {
                alert('父元素clicked')
            }
        } : {},
        children: [
            {
                type: 'p',
                props: {
                    onClick: () => {
                        bol.value = true
                        console.log('lolo');
                    }
                },
                children: 'text'
            },
            {
                type: Text,
                children: 'sb'
            },
            {
                type: 'ul',
                children: [
                    {
                        type: Fragment,
                        children: [
                            { type: 'li', children: 'text 1' },
                            { type: 'li', children: 'text 2' },
                            { type: 'li', children: 'text 3' },
                        ]
                    }
                ]
            }
        ]
    }

    renderer.render(vnode, document.querySelector("#app"))
})