/**
 * The slice of `DataTransfer` a board drag carries. jsdom has no `DataTransfer`, so tests hand the
 * drag events this in its place — which is also why user-event cannot drive a native drag, and
 * the component tests fire the drag events themselves.
 */
export function fakeTransfer() {
  const data = new Map<string, string>();
  return {
    effectAllowed: "uninitialized",
    dropEffect: "none",
    get types() {
      return [...data.keys()];
    },
    setData: (type: string, value: string) => void data.set(type, value),
    getData: (type: string) => data.get(type) ?? "",
  };
}
