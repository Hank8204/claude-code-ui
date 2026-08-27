/** 尾端去抖：連續呼叫只在停歇 waitMs 後執行最後一次。 */
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  waitMs: number
): (...args: A) => void {
  let timer: NodeJS.Timeout | null = null
  return (...args: A): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), waitMs)
  }
}
