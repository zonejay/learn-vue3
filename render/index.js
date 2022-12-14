const { effect, ref, reactive } = VueReactivity
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
                const oldChildren = n1.children
                const newChildren = n2.children
                // 用来存储寻找过程中遇到的最大索引值
                let lastIndex = 0
                // 遍历新的children
                for (let i = 0; i < newChildren.length; i++) {
                    const newNode = newChildren[i]
                    let j = 0
                    // 在第一层循环中定义变量find 表示是否在旧的一组节点中
                    // 找到可复用的节点
                    // 初始值为false 表示没有找到
                    let find = false
                    // 遍历旧的children
                    for (j; j < oldChildren.length; j++) {
                        const oldNode = oldChildren[j];
                        // 如果找到了具有相同key值的两个节点 说明可以复用
                        // 但仍然需要调用patch函数更新
                        if (newNode.key === oldNode.key) {
                            // 如果找到了key相同的节点 将find变为true
                            find = true
                            patch(oldNode, newNode, container)
                            if (j < lastIndex) {
                                // 如果当前找到的节点在旧children中的索引小于最大索引
                                // 说明该节点对应的真实DOM需要移动
                                // 先获取newNode的前一个node 即prevNode
                                const prevNode = newChildren[i - 1]
                                // 如果prevNode不存在 则说明当前newNode是第一个节点
                                // 它不需要移动
                                if (prevNode) {
                                    // 由于我们要将newNode对应的真实节点移动到prevNode所对应
                                    // 真实节点的后面 所以我们需要获取prevNode所对应真实节点
                                    // 的下一个兄弟节点 并将其最为其锚点
                                    const anchor = prevNode.el.nextSibling
                                    // 调用insert方法将newNode对应的真实节点插入
                                    // 到锚点元素前面 也就是prevNode对应真实节点的后面
                                    insert(newNode.el, container, anchor)
                                }
                            } else {
                                // 如果当前找到的节点在旧children中的索引不小于
                                // 最大索引值 则更新lastIndex的值
                                lastIndex = j
                            }
                            break
                        }
                    }
                    // 内层循环完之后如果find的值还是false
                    // 则说明没有找到可复用的节点 需要挂载当前的newNode
                    if (!find) {
                        // 为了将节点挂载到正确位置 需要先获取锚点元素
                        // 首先获取当前newNode的前一个vnode节点
                        const prevNode = newChildren[i - 1]
                        let anchor = null
                        if (prevNode) {
                            // 如果前一个节点不为空 则使用它的下一个兄弟节点作为锚点
                            anchor = prevNode.el.nextSibling
                        } else {
                            // 如果没有前一个vnode 说明即将挂载的新节点是第一个子节点
                            // 应该使用容器元素的firstChild作为锚点
                            anchor = container.firstChild
                        }
                        // 挂载newNode
                        patch(null, newNode, container, anchor)
                    }
                }

                // 循环更新完之后再次遍历旧节点
                for (let i = 0; i < oldChildren.length; i++) {
                    const oldNode = oldChildren[i];
                    // 拿旧子节点oldNode与新的一组子节点中寻找相同key值的节点
                    const has = newChildren.find(vnode => vnode.key === oldNode.key)

                    if (!has) {
                        // 如果没有找到具有相同key值的节点 则说明需要删除该节点
                        unmount(oldNode)
                    }
                }
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
    function mountElement(vnode, container, anchor) {
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
        insert(el, container, anchor)
    }
    // n1 旧vnode
    // n2 新vnode
    function patch(n1, n2, container, anchor) {
        // 不同类型的vnode之间打补丁没有意义
        if (n1 && n1.type !== n2.type) {
            // 直接卸载旧元素
            unmount(n1)
        }
        const { type } = n2
        // 如果为字符串，则描述的是普通标签
        if (typeof type === 'string') {
            // 如果n1不存在 意味着挂载 则调用mountElement函数完成挂载
            if (!n1) {
                mountElement(n2, container, anchor)
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
        console.log(vnode);
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
const vnode = ref({
    type: 'div',
    children: [
        { type: 'p', children: '1', key: 1 },
        { type: 'p', children: '2', key: 2 },
        { type: 'p', children: 'hello', key: 3 }
    ]
})

effect(() => {
    renderer.render(vnode.value, document.querySelector("#app"))
})

// 模拟节点就更新
setTimeout(() => {
    console.log('update');
    vnode.value = {
        type: 'div',
        children: [
            { type: 'p', children: 'world', key: 3 },
            { type: 'p', children: '4', key: 4 },
            { type: 'p', children: '2', key: 2 },
        ]
    }
}, 1000);