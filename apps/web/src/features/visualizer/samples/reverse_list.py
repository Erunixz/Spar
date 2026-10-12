class ListNode:
    def __init__(self, val, next=None):
        self.val = val
        self.next = next


def reverse(head):
    prev = None
    while head:
        nxt = head.next
        head.next = prev
        prev = head
        head = nxt
    return prev


head = ListNode(1, ListNode(2, ListNode(3)))
head = reverse(head)
print(head.val, head.next.val, head.next.next.val)
