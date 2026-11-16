# Security Specification — Netzone Business Manager

## 1. Data Invariants
1. **Strict Ownership**: Every document in `settings`, `customers`, `invoices`, `jobCostings`, `expenses`, and `payments` MUST contain `ownerId == request.auth.uid`. Verified Google Sign-In (`request.auth.token.email_verified == true`) is mandatory for all reads and writes.
2. **No Cross-Tenant Reads/Queries**: `allow get` and `allow list` strictly require `resource.data.ownerId == request.auth.uid` (or `userId == request.auth.uid` for `/settings/{userId}`).
3. **Referential Integrity**:
   - Creating an `Invoice` requires an existing `Customer` owned by the same `request.auth.uid`.
   - Creating a `Payment` requires an existing (or same-batch created via `existsAfter`) `Invoice` owned by `request.auth.uid`.
4. **Immutable Ownership & Creation Timestamps**: `ownerId` and `createdAt` can never change on update. `createdAt` and `updatedAt` must equal `request.time`.
5. **Bounded Arrays & Strict Schemas**: `items` on `Invoice` and `materials` on `JobCosting` are bounded to 1–30 elements and validated structurally. No ghost/shadow fields are allowed (`hasAll` + `hasOnly`).
6. **Financial Non-Negativity & Consistency**: Monetary amounts (`subtotal`, `total`, `amount`, `totalJobCost`) cannot be negative; `balanceDue == total - paidAmount` (within valid non-negative bounds); `pincode` must match `^[0-9]{6}$`.

## 2. "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Unauthenticated Read**: `GET /customers/cust1` without `request.auth`.
2. **Unverified Email Spoof**: `CREATE /customers/cust1` with `request.auth.token.email_verified == false`.
3. **Cross-Tenant List Scraping**: `LIST /invoices` where `ownerId != request.auth.uid` or blanket query without `where('ownerId', '==', uid)`.
4. **Identity Spoofing on Create**: `CREATE /customers/cust2` with `ownerId: "victim_uid"`.
5. **Shadow / Ghost Field Injection**: `CREATE /expenses/exp1` with valid fields plus `"isAdmin": true`.
6. **ID Poisoning**: `CREATE /customers/invalid!id_with_1500_chars...` failing `isValidId()`.
7. **Orphan Invoice**: `CREATE /invoices/inv1` referencing a non-existent or another user's `customerId`.
8. **Orphan Payment**: `CREATE /payments/pay1` referencing a non-existent or another user's `invoiceId`.
9. **Client Timestamp Forgery**: `CREATE /expenses/exp2` with `createdAt: Timestamp(2020-01-01)`.
10. **Immutable Field Tampering**: `UPDATE /invoices/inv1` changing `ownerId` or `createdAt`.
11. **Unbounded Array / Resource Exhaustion**: `CREATE /invoices/inv2` with 31+ line items or invalid `items[0]` type.
12. **Invalid Pincode / Negative Money**: `CREATE /customers/cust3` with `pincode: "ABC"` or `CREATE /payments/pay2` with `amount: -500`.
