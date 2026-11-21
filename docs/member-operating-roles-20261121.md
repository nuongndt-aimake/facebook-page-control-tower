# Vai trò thành viên và mô hình vận hành nền tảng

> **Trạng thái: Đang dùng làm thiết kế quyền/vận hành.** Ngày: 2026-11-21.
> Bổ sung cho [mô hình authorization C-04](authorization-model-and-c04-matrix-20261121.md). Không tự đổi role, capability, RLS hoặc dữ liệu người dùng hiện hữu.

## 1. Nguyên tắc tổ chức

1. **Một người có thể kiêm nhiều vai trò công việc**, nhưng mỗi quyền thực tế là grant tường minh; không “nâng quyền” theo chức danh hiển thị.
2. **Tuyến quản lý không là quyền tài chính.** Tuyến chỉ cho visibility mặc định đối với người/tài sản trong nhánh; quyền duyệt hoặc thao tác cần capability riêng.
3. **Page/đơn/payout là ba loại tài sản khác nhau.** Người giao Page không mặc nhiên được đổi payout; người xử lý đơn không mặc nhiên được xem tài khoản ngân hàng.
4. **Người tạo không tự duyệt** báo cáo, write-off, giá/khuyến mãi, payout hoặc hoa hồng của chính mình. Ngoại lệ đã chốt: `platform_admin`/`super_admin` được tự thực hiện và không cần luồng duyệt thứ hai, nhưng vẫn phải ghi audit. Break-glass `super_admin` phải có lý do/audit.
5. Khách và thành viên nội bộ dùng cùng Supabase Auth nhưng không phải cùng nhóm nghiệp vụ; không đưa khách vào tuyến nhân sự chỉ để xử lý đơn.

## 2. Catalog vai trò nghiệp vụ đích

| Vai trò nghiệp vụ | Mục tiêu/trách nhiệm | Quyền mặc định trên tài sản của mình | Không được suy ra | Người duyệt/quản lý |
| --- | --- | --- | --- | --- |
| Khách vãng lai | Xem thông tin công khai | Catalog public | Đơn, kho, Page, báo cáo | Không áp dụng |
| Người mua có tài khoản | Mua/nhận Page, tải quà đủ điều kiện | Hồ sơ và đơn `buyer_user_id` của mình | Đơn cùng email, tồn kho, quyền Facebook/Google | Sale được phân công xử lý đơn |
| Người mua guest | Mua không đăng ký | Một đơn qua tracking token có hạn | Claim đơn bằng email, truy cập tài khoản | Sale được phân công |
| CTV bán hàng | Giới thiệu khách/mã referral | Attribution và báo cáo hoa hồng của chính mình theo policy đã chốt | Giá, chiết khấu, chi tiết PII đơn khách, tự chi hoa hồng | Quản lý CTV/finance reviewer |
| CTV nội dung | Vận hành nội dung Page Inhouse được giao | Xem Page trực tiếp, kho ảnh/video được cấp; nộp báo cáo từng Page–ngày–assignment | Duyệt báo cáo, quản lý payout, giao người, sửa số liệu đã verified | Quản lý trực tiếp có `verify_reports` |
| Nhân viên sale | Tư vấn, theo dõi và bàn giao đơn được giao | Đọc/xử lý đơn assignee; thao tác fulfillment đúng capability | Kho mọi Page, sửa giá, tự đối soát/duyệt đơn của mình | Quản lý sale hoặc order manager |
| Nhân viên kho tổng | Nhập, kiểm tra, publish và quản lý tồn kho để bán | Thao tác kho theo action grant trong **nhánh sản phẩm** được giao: intake/publish/reserve/release | Thấy mọi đơn/PII, chuyển Inhouse, write-off, tự thay giá | Quản lý kho/asset có scope cùng nhánh |
| Nhân viên quản lý tài sản Inhouse | Quản lý Page đã chuyển Inhouse: tình trạng, phân công, kho Sheet, payout liên kết | Toàn bộ thông tin tài sản Inhouse thuộc direct/managed scope; `assign_inhouse`, resource configure hoặc payout manage nếu được grant | Nhập kho tổng, bán ngoài, thay giá/discount, duyệt báo cáo của mình | Quản lý vận hành/asset |
| Người xác minh báo cáo | Kiểm tra chứng cứ/chất lượng báo cáo | Đọc báo cáo trong nhánh hoặc scope được giao; `verify_reports` | Tự duyệt bản ghi của mình, chốt/chi hoa hồng | Quản lý vận hành hoặc finance reviewer |
| Quản lý tuyến | Quản nhân sự/CTV trực tiếp và gián tiếp | Xem nhánh, Page/report theo scope inherited | Read-all toàn nền tảng, financial approval, thao tác kho không có grant | Quản lý cấp trên/platform admin |
| Quản lý vận hành | Điều phối kho/đơn/Inhouse theo module được giao | Các capability module được grant và scope team/branch | Cấu hình platform, tài khoản khác, thanh toán/chi nếu không grant | Platform admin/finance approver |
| Quản lý tài chính | Chính sách hoa hồng, invoice, payout review | Đọc dữ liệu tài chính đã mask theo scope, duyệt theo maker-checker | Tự tạo và tự duyệt, quyền Page/Meta mặc định | Platform admin hoặc finance approver khác |
| Quản trị nền tảng | Cấu hình module, người dùng, grant, policy | Trong transition: all capability có audit; đích là capability platform tường minh | Bỏ audit, đọc secret thô, giả danh user để ghi | Super admin/break-glass governance |
| Super admin | Khôi phục/break-glass kỹ thuật | All capability/scope theo quy ước | Hoạt động thường nhật không audit hoặc tự bỏ kiểm soát tài chính | Audit độc lập/chủ hệ thống |

## 3. Ba vai trò đang dễ bị lẫn nhất

### Nhân viên sale khác nhân viên kho

- **Sale** sở hữu tiến trình quan hệ với đơn được phân công: xác minh thông tin giao, liên hệ khách, bắt đầu/cập nhật/cấp xong bàn giao ngoài hệ thống. Sale không tự chọn Page ngoài phân bổ hợp lệ, không tự sửa giá, không tự xác minh thanh toán của đơn mình nếu chính sách yêu cầu tách người.
- **Kho tổng** sở hữu chất lượng/tồn trạng của mã Page: nhập, kiểm tra, publish, reserve/release theo transaction. Kho không nhìn toàn bộ PII đơn ngoại trừ lượng tối thiểu cần để giữ/cấp hàng; không tự đổi thành trạng thái hoàn tất giao khách.
- Một người có thể kiêm sale + kho khi được cấp hai pack, nhưng hệ thống phải vẫn ghi action/audit theo capability, không dùng một role `operator` mơ hồ.

### Quản lý tài sản Inhouse khác cộng tác viên nội dung

- **Asset manager Inhouse** chịu trách nhiệm vòng đời Page sau chuyển kho: tình trạng hoạt động/hỏng, phân công người, đổi assignment, gắn payout, cấu hình hai Sheet ảnh/video. Người này không sở hữu doanh thu cá nhân của Page.
- **CTV nội dung** chịu trách nhiệm phần việc được giao: đăng nội dung và nộp kết quả hằng ngày theo Page–assignment. Hai CTV cùng Page có hai dòng báo cáo/hưởng riêng; tổng Page chỉ là phép tổng hợp, không phân bổ thay họ.
- Asset manager có thể là người phê duyệt nếu được cấp `verify_reports`, nhưng phải bị chặn tự duyệt report do chính mình tạo.

### Quản lý tuyến khác quản trị viên nền tảng

- **Manager** đọc nhánh được phân công, nhận báo cáo trực tiếp/gián tiếp, xác minh trong scope nếu có grant. Không mặc định sửa người dùng, cấp quyền, đổi policy hay truy cập tài sản ngoài nhánh.
- **Platform admin** quản trị cấu hình liên-module và capability. Mọi grant phải có reason, thời hạn (nếu delegation) và audit; không lấy “platform admin” làm lý do để bỏ maker-checker.

## 4. Pack capability để chuyển tiếp từ role legacy

Schema hiện có chỉ có `viewer`, `analyst`, `operator`, `manager`, `platform_admin`, `super_admin`. Không thêm role database vội; chuyển tiếp bằng pack minh bạch:

| Pack | Capability chính | Scope mặc định |
| --- | --- | --- |
| `content_contributor` | report submit, resource view | direct Page assignment + resource grant |
| `sales_agent` | orders assigned read/handover | `sales_order_assignments` |
| `inventory_clerk` | inventory read/intake/publish/reserve/release | kho/product được grant |
| `inhouse_asset_manager` | inventory read/assign_inhouse, resource configure, payout manage khi cần | direct/managed Inhouse Page |
| `report_reviewer` | verify_reports | branch/scope được chỉ định, exclude self |
| `sales_operations_manager` | order assign, inventory escalation | team/branch/module được cấp |
| `finance_reviewer` | invoice/commission/payout review | scope tài chính, maker-checker |
| `platform_governance` | users/roles/policy/integration manage | all, audited |

`operator`/`manager` legacy chỉ là container tạm để tương thích API cũ. Sau C-04, UI Nhân sự phải hiển thị các pack/grant thực tế cùng scope/thời hạn, không gắn nhãn “operator” rồi để người quản lý tự suy diễn quyền.

## 5. RACI tối thiểu cho luồng Fanpage

| Công việc | Thực hiện (R) | Chịu trách nhiệm (A) | Tham vấn (C) | Được thông tin (I) |
| --- | --- | --- | --- | --- |
| Nhập/kiểm tra/publish Page kho tổng | Nhân viên kho | Quản lý kho | Sale khi có đơn nợ | Quản lý vận hành |
| Phân bổ Page vào đơn | Kho hoặc sale được grant | Quản lý vận hành | Sale assignee | Khách theo trạng thái đơn |
| Cấp quyền Facebook cho khách | Sale assignee | Quản lý sale | Kho xác nhận mã Page | Khách |
| Ghi hỏng/đổi bảo hành | Kho/asset manager được grant | Quản lý kho | Sale assignee | Finance khi có chi phí |
| Chuyển Page sang Inhouse | Kho/asset manager được grant | Quản lý vận hành | Người nhận Inhouse | Quản lý tuyến |
| Giao Page Inhouse/Sheet/Payout | Asset manager | Quản lý vận hành | Quản lý trực tiếp | CTV được giao |
| Nộp báo cáo ngày | CTV nội dung | CTV nội dung | — | Quản lý trực tiếp |
| Verify báo cáo | Report reviewer khác người lập | Quản lý vận hành | Asset manager nếu có chứng cứ | CTV/finance |
| Chốt/duyệt hoa hồng | Finance reviewer khác maker | Finance approver | Manager | CTV/nhân sự |

## 6. Các quyết định cần quản lý chốt trước khi migration quyền

### Quyết định đã chốt — 2026-11-21

| Chủ đề | Quy tắc đã chốt | Hệ quả triển khai |
| --- | --- | --- |
| Quản trị nền tảng | `platform_admin` và `super_admin` được tự thực hiện action trong phạm vi platform, không cần approval thứ hai; bắt buộc audit actor/reason. | Không dùng rule maker-checker để chặn admin; UI/API phải thể hiện rõ đây là ngoại lệ có audit. |
| Đơn 0đ | Đơn do người có cấp quản lý tạo (`manager` có scope hoặc platform/super admin) được xác minh ngay. Đơn do nhân viên tạo phải chờ **quản lý đúng nhánh và có capability** duyệt. Đơn public/guest 0đ vẫn chờ nhân sự có thẩm quyền. | Thêm capability chuyên biệt `sales_orders.verify_zero`; ghi creator/creator scope, reviewer và reason. Không dùng `finalize` thay cho quyền duyệt. |
| Quản lý nhánh | Không phải cứ role `manager` là duyệt hết. Manager chỉ có action nếu được cấp capability và asset/order/product branch nằm trong scope active của họ. Manager có `sales_inventory.intake` trong nhánh X mới được nhập kho X. | Effective authorization phải trả `scope_source` và product branch; UI chỉ là biểu diễn kết quả server. |
| Kho tổng | Kho tổng phân theo **nhánh sản phẩm**; capability kho luôn đi cùng scope branch, không phải một quyền kho chung không giới hạn. | Bổ sung product branch vào catalog/item/grant, migration/backfill và test cross-branch deny trước khi bật. |
| Tài sản Inhouse | Asset manager xem đầy đủ thông tin tài sản thuộc mình/nhánh mình. Tổng quản lý có grant `inhouse_assets.manage_all` được quản lý toàn bộ tài sản Inhouse. | Tách `manage_all` rõ ràng khỏi role manager; thông tin payout nhạy cảm vẫn theo capability payout riêng. |
| Hàng ngừng bán/hết hạn | Hàng bị rút bán hoặc hết hạn nằm ở danh sách riêng, còn lịch sử/chi phí giữ nguyên. Muốn ghi nhận **hủy hẳn/retire** phải là manager đúng branch có capability `sales_inventory.retire` hoặc platform/super admin. Không xóa cứng. | Thêm state `withdrawn`/`expired`/`retired` và ledger reason; `retired` không được quay lại bán, không sinh doanh thu. |

### Thiết kế trạng thái kho bổ sung

| Trạng thái | Ý nghĩa | Ai có thể chuyển | Có thể quay lại bán |
| --- | --- | --- | --- |
| `withdrawn` | Tạm rút khỏi bán, chưa xác định tổn thất | Nhân sự kho có `release`/`withdraw` trong branch | Có, qua publish có audit |
| `expired` | Hết hạn bán/không còn điều kiện kinh doanh, chờ xử lý | Worker/policy hoặc manager trong branch; không tự xóa | Không trực tiếp; manager quyết định publish lại hoặc retire theo reason |
| `retired` | Hủy ghi sổ vĩnh viễn, tách danh sách vận hành | Manager có `retire` trong branch; platform/super admin | Không; chỉ correction break-glass có audit |

Hai trạng thái đầu không phải `damaged`: `damaged` ghi nhận hỏng/loss theo write-off, còn `retired` là quyết định quản trị vòng đời. Đơn đã reserve/paid/completed không được retire bằng thao tác kho thường; phải đi qua luồng release/reconciliation/warranty phù hợp.

### Việc còn cần chốt

1. Ngưỡng tiền/quy tắc maker-checker cho payout, write-off, giá và hoa hồng với người không phải platform admin.
2. Thời hạn mặc định của delegation tạm thời; ai được gia hạn và ai nhận cảnh báo hết hạn.

Các quyết định mới thay đổi quyền tài chính/vận hành thực tế. Sau khi C-06 xác minh migration history/schema, C-04 sẽ có migration grants/product branch/state, RLS/API contract, screen Nhân sự, audit và deny-tests tương ứng trong cùng release.
