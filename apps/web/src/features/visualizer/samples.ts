import binarySearch from './samples/binary_search.py?raw'
import fibMemo from './samples/fib_memo.py?raw'
import fibNaive from './samples/fib_naive.py?raw'
import lcsGrid from './samples/lcs_grid.py?raw'
import reverseList from './samples/reverse_list.py?raw'
import slidingWindow from './samples/sliding_window.py?raw'
import treeDepth from './samples/tree_depth.py?raw'
import twoPointers from './samples/two_pointers.py?raw'

/** Starter programs; the same files are the tracer's golden tests. */
export const SAMPLES = [
  { id: 'binary_search', name: 'Binary search', source: binarySearch },
  { id: 'two_pointers', name: 'Two pointers: pair with sum', source: twoPointers },
  { id: 'sliding_window', name: 'Sliding window: longest unique run', source: slidingWindow },
  { id: 'reverse_list', name: 'Reverse a linked list', source: reverseList },
  { id: 'tree_depth', name: 'Tree depth (recursion)', source: treeDepth },
  { id: 'lcs_grid', name: 'Longest common subsequence (DP grid)', source: lcsGrid },
  { id: 'fib_naive', name: 'Fibonacci without memo (recursion tree)', source: fibNaive },
  { id: 'fib_memo', name: 'Fibonacci with memo', source: fibMemo },
] as const
