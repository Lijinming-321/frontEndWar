/* @flow */

import Dep from './dep'
import VNode from '../vdom/vnode'
import { arrayMethods } from './array'
import {
  def,
  warn,
  hasOwn,
  hasProto,
  isObject,
  isPlainObject,
  isPrimitive,
  isUndef,
  isValidArrayIndex,
  isServerRendering
} from '../util/index'

const arrayKeys = Object.getOwnPropertyNames(arrayMethods)

/**
 * In some cases we may want to disable observation inside a component's
 * update computation.
 */
export let shouldObserve: boolean = true

export function toggleObserving (value: boolean) {
  shouldObserve = value
}

/**
 * Observer class that is attached to each observed
 * object. Once attached, the observer converts the target
 * object's property keys into getter/setters that
 * collect dependencies and dispatch updates.
 */

/**
 * Observe类会通过递归的方式把一个对象的所有属性都转化成可观测对象
 */
export class Observer {
  value: any;
  dep: Dep;
  vmCount: number; // number of vms that have this object as root $data

  constructor (value: any) {
    this.value = value
    this.dep = new Dep()
    this.vmCount = 0
    // 给value新增一个__ob__属性，值为该value的Observe实例
    // 相当于为1value打上标记，表示1它已经转换为响应式了，避免重复操作
    def(value, '__ob__', this)
    if (Array.isArray(value)) {
      // 当value为数组时的逻辑
      if (hasProto) { // 这个判断是为了将重写的数组方法挂载到__proto__上
        protoAugment(value, arrayMethods)
      } else {
        copyAugment(value, arrayMethods, arrayKeys)
      }
      this.observeArray(value) // 将数组的所有元素转化为可被侦测的响应式
    } else {
      this.walk(value)
    }
  }

  /**
   * Walk through all properties and convert them into
   * getter/setters. This method should only be called when
   * value type is Object.
   */
  walk (obj: Object) {
    const keys = Object.keys(obj)
    for (let i = 0; i < keys.length; i++) {
      defineReactive(obj, keys[i])
    }
  }

  /**
   * Observe a list of Array items.
   */
  observeArray (items: Array<any>) {
    for (let i = 0, l = items.length; i < l; i++) {
      observe(items[i])
    }
  }
}

// helpers

/**
 * Augment a target Object or Array by intercepting
 * the prototype chain using __proto__
 */
function protoAugment (target, src: Object) {
  /* eslint-disable no-proto */
  target.__proto__ = src
  /* eslint-enable no-proto */
}

/**
 * Augment a target Object or Array by defining
 * hidden properties.
 */
/* istanbul ignore next */
function copyAugment (target: Object, src: Object, keys: Array<string>) {
  for (let i = 0, l = keys.length; i < l; i++) {
    const key = keys[i]
    def(target, key, src[key])
  }
}

/**
 * Attempt to create an observer instance for a value,
 * returns the new observer if successfully observed,
 * or the existing observer if the value already has one.
 */
export function observe (value: any, asRootData: ?boolean): Observer | void {
  if (!isObject(value) || value instanceof VNode) {
    return
  }
  let ob: Observer | void
  if (hasOwn(value, '__ob__') && value.__ob__ instanceof Observer) {
    ob = value.__ob__
  } else if (
    shouldObserve &&
    !isServerRendering() &&
    (Array.isArray(value) || isPlainObject(value)) &&
    Object.isExtensible(value) &&
    !value._isVue
  ) {
    ob = new Observer(value)
  }
  if (asRootData && ob) {
    ob.vmCount++
  }
  return ob
}

/**
 * Define a reactive property on an Object.
 * 在Object上定义响应式属性
 * 使一个对象转化为可观测对象
 * obj：obj对象
 * key：key对象的key
 * val：val对象的某个key值
 */
export function defineReactive (
  obj: Object,
  key: string,
  val: any,
  customSetter?: ?Function,
  shallow?: boolean
) {
  const dep = new Dep() // 实例化一个依赖管理器，生成一个依赖管理数组dep

  const property = Object.getOwnPropertyDescriptor(obj, key)
  if (property && property.configurable === false) {
    return
  }

  // cater for pre-defined getter/setters
  const getter = property && property.get
  const setter = property && property.set
  if ((!getter || setter) && arguments.length === 2) {
    // 如果只传了obj和key，那么val=obj[key]
    val = obj[key]
  }

  let childOb = !shallow && observe(val)
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    get: function reactiveGetter () {
      const value = getter ? getter.call(obj) : val
      if (Dep.target) {
        dep.depend() // 在getter中收集依赖
        if (childOb) {
          childOb.dep.depend()
          if (Array.isArray(value)) {
            dependArray(value)
          }
        }
      }
      return value
    },
    set: function reactiveSetter (newVal) {
      const value = getter ? getter.call(obj) : val
      /* eslint-disable no-self-compare */
      if (newVal === value || (newVal !== newVal && value !== value)) {
        return
      }
      /* eslint-enable no-self-compare */
      if (process.env.NODE_ENV !== 'production' && customSetter) {
        customSetter()
      }
      // #7981: for accessor properties without setter
      if (getter && !setter) return
      if (setter) {
        setter.call(obj, newVal)
      } else {
        val = newVal
      }
      childOb = !shallow && observe(newVal)
      dep.notify()  // 通知依赖更新
    }
  })
}

/**
 * Set a property on an object. Adds the new property and
 * triggers change notification if the property doesn't
 * already exist.
 */
export function set (target: Array<any> | Object, key: any, val: any): any {
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))  // 在非生产环境下判断传入target是否为undefined, null
  ) {
    warn(`Cannot set reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  if (Array.isArray(target) && isValidArrayIndex(key)) { // 判断传入的target是否为数组，并且传入的key是有效索引
    target.length = Math.max(target.length, key)
    target.splice(key, 1, val) // 使用重写的splice()向数组内添加元素
    return val
  }
  if (key in target && !(key in Object.prototype)) { // 判断target是对象，且key是该对象的属性,表示操作的不是新属性，只对已有属性进行简单的修改值
    target[key] = val // 新增属性
    return val
  }
  const ob = (target: any).__ob__  // 获取target的__ob__属性 
  if (target._isVue || (ob && ob.vmCount)) { // ob == true，标志target是响应式对象，再判断target是否为Vue实例或Vue实例的跟数据，则抛出警告
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid adding reactive properties to a Vue instance or its root $data ' +
      'at runtime - declare it upfront in the data option.'
    )
    return val
  }
  if (!ob) { // ob == false，target不是一个响应式对象，那么我们只需简单给它添加上新的属性，不用将新属性转化成响应式
    target[key] = val
    return val
  }
  //如果target是对象，并且是响应式，那么就调用defineReactive方法将新属性值添加到target上，
  //defineReactive方会将新属性添加完之后并将其转化成响应式，最后通知依赖更新
  defineReactive(ob.value, key, val) 
  ob.dep.notify()
  return val
}

/**
 * Delete a property and trigger change if necessary.
 */
export function del (target: Array<any> | Object, key: any) {
  // 判断非生产环境下，传入的target不存在或target是原始值则抛出警告
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot delete reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  if (Array.isArray(target) && isValidArrayIndex(key)) { // target是数组且下标有效，删除
    target.splice(key, 1)
    return
  }
  const ob = (target: any).__ob__  // 不是数组，其他当对象处理
  if (target._isVue || (ob && ob.vmCount)) { // target是Vue或Vue的根数据，报出警告并退出程序
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid deleting properties on a Vue instance or its root $data ' +
      '- just set it to null.'
    )
    return
  }
  if (!hasOwn(target, key)) { // target不包含key，退出
    return
  }
  delete target[key] // 从target中删除属性名为key的属性
  if (!ob) { // target 不是响应式，删除后就返回
    return
  }
  ob.dep.notify() // target是响应式的，删除后通知依赖dep更新
}

/**
 * Collect dependencies on array elements when the array is touched, since
 * we cannot intercept array element access like property getters.
 */
function dependArray (value: Array<any>) {
  for (let e, i = 0, l = value.length; i < l; i++) {
    e = value[i]
    e && e.__ob__ && e.__ob__.dep.depend()
    if (Array.isArray(e)) {
      dependArray(e)
    }
  }
}

/**
 * 当value的类型为Object时，才会调用walk()将每一个属性转换成getter/setter的形式来侦测变换。
 * 最后，在defineReactive()中当传入的属性值还是一个Object时，使用new observer(val)来递归子属性，这样就可以把obj中的所有属性（包括子属性）都转换成getter/setter的形式来侦测变化
 */