# Đối chiếu kế hoạch và điểm tạm dừng

> **Hết hiệu lực làm baseline hiện hành từ 2026-11-21.** Đây là snapshot lịch sử tại `8ba970c` (Vercel `2JciXZGXrMnUAcX6PGfbrikQ1BxV`), không phải nghiệm thu mới toàn bộ dữ liệu/ngân hàng/quyền Google thật. Thay thế bằng [kế hoạch chấn chỉnh tính nhất quán và kiểm soát](reconciliation-control-plan-20261121.md). Nội dung bên dưới được giữ nguyên để truy vết quyết định và phạm vi tại thời điểm chụp.

## Impact note của lượt này

- UI/navigator: chuyển `/access` từ Vận hành sang Tài khoản, nhãn Tài sản được giao, đồng bộ tên màn hình. Không đổi route hoặc tạo bản sao dữ liệu.
- API/database/RBAC: không thay đổi, không migration, không cấp/thu hồi quyền người dùng. Menu không được xem là kiểm tra quyền; endpoint giữ auth/context/scope và kiểm tra action server-side. Đối chiếu đầy đủ ma trận quyền vào từng module còn nằm trong kế hoạch.
- Order: chỉ ghi nhận thiết kế tiếp theo, chưa sửa `fulfillment-workflow.js`, RPC kho, checkout hoặc đơn thật.
- Không thay env/domain/cron/Meta/SePay/Google sharing. Chỉ phát hành sửa menu đã được yêu cầu; các tính năng còn lại tạm dừng.
- Tài liệu: bản này là chỉ mục hiện trạng; các kế hoạch cũ giữ nguyên bên dưới mục lịch sử, không dùng số Gate hoặc nhãn Roadmap cũ để kết luận tính năng mới chưa có.

## 1. Đã triển khai, phạm vi đã xác định

| Hạng mục | Thực tế đã có | Ranh giới/chưa được suy diễn |
| --- | --- | --- |
| Nền tài khoản | Supabase Auth dùng chung, Google login, phone/Profile Facebook, tuyến quản lý, audit, bàn giao và preview đọc theo cơ chế hiện hành | Không phải chín nhóm nghiệp vụ đã có đủ màn hình/quyền riêng; chưa nghiệm thu mọi ca offboard nhiều tầng với grants kho mới |
| Catalog | Có bốn nhóm trong mô hình dữ liệu; mở luồng Fanpage | Skill/khóa học/thuê bao chưa có fulfillment hoàn chỉnh |
| Kho tổng Fanpage | ID/link/tên hiện tại/tài khoản cầm/giá nhập, nhập tay + CSV/TSV, transaction/chống trùng/rollback, mở bán/giữ/trả, ledger | Chưa có chính sách tự hết giữ hàng/cron thu hồi reservation |
| Kho Inhouse | Chuyển từ đơn 0đ đã xác minh, rời kho tổng, registry không cần sync, nhiều phân công trên một Page, tìm/lọc/copy/sửa tên | Giao trên ứng dụng không tự cấp Facebook quyền |
| Dữ liệu nhập đầu kỳ | Đã nhập/chuyển 149 Page theo danh sách, giá vốn ban đầu 700.000đ/Page | Đây là kết quả nhập đã ghi nhận, không cam kết tồn kho hiện tại vẫn đúng 149 sau người dùng vận hành |
| Page hỏng/bảo hành | Ghi hỏng, ghi chi phí không sinh doanh thu; đổi Page gắn đơn và giữ lịch sử/nợ nếu thiếu hàng | Không tự xóa tài sản/lịch sử hoặc khôi phục hàng lỗi về bán được |
| Giá/chiết khấu/ưu đãi | Admin cấu hình thời điểm, public quote và snapshot đơn dùng cùng nguyên tắc; mã ưu đãi tách mã giới thiệu | Chính sách hoa hồng affiliate chưa được tạo chỉ vì đã lưu mã giới thiệu |
| Checkout/thanh toán | Khách/đăng nhập, thông tin nhận Page, hóa đơn, mã đơn/QR/tải QR/đếm ngược, tracking token, đơn 0đ có xác minh staff, webhook xác thực/idempotent | Các test webhook/SQL không phải bằng chứng đã chuyển tiền ngân hàng thật hoặc đối soát giao dịch thật mới trong lượt này |
| Đơn hàng | Người mua xem đơn mình, nhân viên theo assignee/quyền all, danh sách gọn + chi tiết/bộ lọc, phân bổ/nợ Page/bảo hành/cấp quyền ngoài rồi xác nhận | Giao diện bàn giao chưa tái dùng màn hình giao nhân sự với thông tin đầu vào đơn; xem mục 3 |
| Hóa đơn | Thu đủ dữ liệu hóa đơn, theo dõi yêu cầu xuất riêng hoặc danh sách đủ điều kiện gộp/ngày | Chưa tích hợp phát hành hóa đơn điện tử hợp pháp/nhà cung cấp; bảng yêu cầu/gộp không phải hóa đơn đã được xuất |
| Payout | Gắn một payout/Page, tạo/chọn tại chỗ, lịch sử; báo cáo USD có snapshot hoặc pending payout | Không phải chức năng chi tiền, không tự ghi payout/tiền thực tế |
| Báo cáo/Tổng quan | Lưới nhân sự–Page–ngày, số bài/tiền ngày/tiền hiện tại USD, revision/duyệt thủ công, own/branch/admin, tổng theo người/Page, Tổng quan dùng báo cáo | Chưa tự kiểm chứng doanh thu Facebook, chưa tự chốt hoa hồng; thiếu báo cáo không coi là 0; luỹ kế không cộng theo ngày |
| Hai kho tài nguyên | Hai Sheet ảnh/video theo Page, grants theo assignment, configure/giao kho atomic, xem Google preview hoặc mở liên kết, quyền riêng tư theo Google cá nhân | Chưa có hai URL file thật cho nghiệm thu yêu cầu/duyệt email Google. Không có importer/parse/snapshot Sheet server trong bản này; thiết kế cũ đã được thay thế |
| Menu/UX chung | Dùng chung, active group, menu mobile, ghim có spacer; thao tác kho gọn trong ⋯ | Không suy ra tất cả màn hình cũ đã được nghiệm thu UX từng trạng thái |

Bằng chứng gần nhất: 51 Node tests, 59 kiểm tra SQL rollback và 11 trường hợp API tài nguyên đạt; 390/768/1280 kiểm tra dialog/menu bằng fixture cục bộ. Đây là phạm vi QA của bản `8ba970c`, không thay thế nghiệm thu mọi chức năng lịch sử.

## 2. Chưa hoàn thiện / chưa triển khai / chủ động để chờ

| Hạng mục | Trạng thái đúng | Phụ thuộc/việc còn lại |
| --- | --- | --- |
| Bàn giao từ đơn theo giao diện dùng chung | Ưu tiên tiếp theo, đã có nền kho/đơn | Tái dùng thành phần Page/người nhận từ giao nhân sự; người nhận lấy order snapshot, thêm copy Profile; không chọn nhầm khách hoặc tạo tài khoản khách guest |
| Quyền vào module và phạm vi dữ liệu | Có kiểm tra hiện hành, chưa hợp nhất đầy đủ ma trận entry/action/scope cho toàn nền tảng | Kiểm kê từng role/capability, endpoint và màn hình; phân biệt forbidden với allowed-empty; rà soát grant Page cũ, handover và tài khoản quản lý nhiều tầng; không tự mở quyền rộng chỉ để hiện menu |
| Hoa hồng CTV nội dung | Có schema chính sách/kết quả; chưa có luồng tính/chốt/duyệt chi hoàn chỉnh theo báo cáo USD | Chốt đơn giá/bài + % doanh thu, ngày hiệu lực, kỳ chốt, làm tròn, nguồn hợp lệ/bằng chứng/điều chỉnh. Cơ chế cấu hình tỷ lệ cũ trên `/commissions` không thay engine mới |
| Affiliate bán hàng | Mã giới thiệu/attribution và quà đã có nền; portal/đối soát/chốt hoa hồng chưa hoàn chỉnh | Chính sách hoa hồng, điều kiện đơn đủ chuẩn, thu hồi khi hủy/hoàn/bảo hành; màn hình mã và doanh số trong Tài khoản |
| Quyền lợi quản lý theo tuyến | Visibility có, quyền hưởng/chốt chi chưa hoàn chỉnh | Xác minh quyền hưởng trực tiếp/gián tiếp; không cộng dồn tự động |
| Reserve hết hạn/đơn hủy/thiếu hàng | Giữ/trả thủ công và nợ Page có; tự giải phóng/tự bù đơn khi nhập thêm chưa hoàn chỉnh | Chốt TTL/ưu tiên hàng đợi/điều kiện trả hàng; worker idempotent + audit. Không tự bật cron |
| Google Sheet thật | Chức năng đã phát hành, nghiệm thu file thật còn chờ cấu hình | Nhập hai URL, quản lý file có quyền chia sẻ, tài khoản nhân sự đúng email; thử xin quyền/duyệt/mở file. Thu hồi app không tự thu hồi Google |
| Quà/hỗ trợ/video hướng dẫn | Có cấu hình/điểm hiển thị | Rà dữ liệu thật đã nhập; link quà, phone/Zalo/video không được tự đặt. Kiểm tra bảo vệ link tải có thời hạn nếu áp dụng thiết kế entitlement, không coi link tĩnh sau paid là signed-download đã xong |
| Hóa đơn phát hành thật | Roadmap | Chọn cơ chế/nhà cung cấp, xử lý gộp cuối ngày và trạng thái phát hành thật |
| Nhóm Skill | Chỉ có khung | Catalog/fulfillment tải nhiều lần, entitlement, hạn/quyền tải, admin và QA |
| Nhóm khóa học | Chỉ có khung | Enrollment, video bài học, Zoom, kiểm soát truy cập và QA |
| Nhóm thuê bao | Chỉ có khung | Kỳ hạn/gia hạn/thông báo hết hạn/thu hồi quyền có audit; không triển khai tự hủy trước chính sách |
| Meta/Facebook sync, BM | Khoanh vùng, không ưu tiên của line này | Giữ dữ liệu/module lịch sử; không dùng làm nguồn nhập Inhouse hoặc tổng quan báo cáo mới |
| Domain riêng khác | Hoãn theo quyết định trước | Dùng money.aiecom.vn hiện có, không tạo domain mới |

## 3. Luồng xử lý đơn được xác nhận cho bước kế tiếp

### Nền đang có — không làm lại

- `sales_checkout_create` (migration `20261119224000`) lấy hàng `available` đúng product, lock `FOR UPDATE SKIP LOCKED`, giữ được bao nhiêu gắn vào `sales_order_inventory_items` bấy nhiêu; thiếu đánh dấu `page_debt`. Hiện việc giữ hàng xảy ra lúc checkout, trước thanh toán; không được mô tả là chỉ bắt đầu giữ sau paid.
- Khi mở Xử lý đơn đã thanh toán, `fulfillment-workflow.js` gọi `allocate` nếu có scope reserve; RPC chỉ bù phần còn thiếu, không tạo bản phân bổ trùng. Vì vậy trigger bù hiện tại là lúc mở xử lý/nút Phân bổ thêm, không phải chứng minh có worker tự chạy ngay khi đơn mới hoặc nhập hàng mới.
- Đã có trạng thái phân bổ → đang cấp → hoàn tất, báo nợ, bảo hành/đổi hàng và xác nhận đã cấp quyền ngoài hệ thống.

### Phần cần điều chỉnh tiếp theo — chưa triển khai

1. Từ Đơn hàng → Xử lý đơn: tải đúng order_id bằng quyền server. Header nhận từ snapshot đơn: họ tên, điện thoại, email, `fulfillment_profile_url`, số lượng, sản phẩm, thanh toán/xác minh, ghi chú bàn giao/hóa đơn khi cần.
2. Tái dùng phần hiển thị Page của cửa sổ Giao nhân sự: tên/ID/link/copy/tài khoản đang cầm, thông tin khách nhận Page và Profile khách nhận. Điểm khác là **người nhận được lấy từ đơn**, không dùng ô chọn nhân sự làm nguồn khách nhận. Khách guest không bị ép thành nhân viên/tài khoản hệ thống.
3. Lấy đúng sản phẩm trong kho tổng để gắn cho đơn, hiển thị từng Page đã phân bổ và phần thiếu. Không lấy Page đang thuộc Inhouse hoặc thuộc đơn khác; không lấy sai loại sản phẩm. Giữ transaction và chống tranh chấp hiện có.
4. Bán hàng/cấp quyền Facebook bên ngoài theo Profile đầu vào của khách. Hiển thị tình trạng đang cấp, ghi chú/bằng chứng bàn giao theo thiết kế sẽ chốt. Chỉ xác nhận hoàn tất sau khi người xử lý xác nhận cấp xong.
5. Đơn Inhouse 0đ phải qua xác minh staff rồi chuyển kho; chỉ định nhân sự vận hành/kho ảnh/video vẫn là thao tác của quản lý sau chuyển kho. Không tự biến khách mua ngoài thành CTV hoặc tự cấp Google/Facebook quyền.
6. Hàng thiếu: giữ đơn nợ, nhắc nhập kho. Nếu muốn tự phân bổ ngay khi thanh toán/nhập kho thay vì khi mở xử lý, cần bổ sung trigger/worker + thứ tự ưu tiên và nghiệm thu idempotency; chưa bật trong lượt tạm dừng.
7. Hàng lỗi: đổi Page trong cùng đơn, Page cũ hỏng + chi phí một lần, giữ lịch sử. Không thanh toán/chốt đơn hai lần hoặc cộng doanh thu lần nữa khi đổi hàng.

Phạm vi tác động lần tiếp tục: component giao nhận dùng chung, fulfillment-workflow.js, inventory-assignment.mjs, sales_fulfillment response (thông tin order đã có), order/inventory RPC nếu thêm trigger; RBAC order-scope và Page-scope phải giữ tách. Test: buyer/guest/assignee/read_all/admin/ngoài phạm vi; đơn đủ/thiếu kho; request đồng thời/retry; zero chưa verified; đổi hàng; thông tin người nhận đúng snapshot; 390/768/desktop. Không dùng thông tin profile nhân sự để ghi đè thông tin người mua của đơn.

## 4. Hai lớp quyền phải phân biệt

| Lớp | Câu hỏi | Cách xử lý |
| --- | --- | --- |
| Entry/action | Có được vào chức năng hoặc thực hiện thao tác không? | Server kiểm tra auth, active profile, capability/action. Không có quyền thì 401/403 theo tình huống; không chỉ ẩn menu |
| Data scope | Nếu được vào thì được đọc những dòng nào? | Query/RPC lọc own, assigned, branch hoặc all theo quyền hiện có; không trả tất cả rồi lọc ở browser |

Ví dụ hiện hành: `/access` cho tài khoản active xem tài sản trong phạm vi; không có tài sản thì trạng thái trống, không đồng nghĩa bị cấm vào. Admin thấy toàn bộ; manager theo nhánh; nhân viên/CTV tài sản trực tiếp/quyền hợp lệ. `manage_payout`, `assign_inhouse`, `reserve`, `finalize`, `verify_reports` là quyền thao tác riêng, không tự có chỉ vì xem được tài sản. Hai kho tài nguyên còn yêu cầu loại grant image/video và quyền file Google riêng. Kho bán hàng yêu cầu read; không có thì API từ chối dù gõ URL. Đơn hàng dùng buyer/assignee/read_all/admin riêng, không áp quyền nhìn Page để mở tất cả đơn.

Chưa tuyên bố mọi module đã có một ma trận entry thống nhất hoặc platform_admin đã giới hạn chức năng chi tiết theo thiết kế mục tiêu. Đó là hạng mục phải đối chiếu/chuẩn hóa riêng trước khi mở rộng role hoặc quyền mới.

## 5. Thứ tự khi người dùng yêu cầu tiếp tục

1. Hoàn thiện luồng bàn giao từ đơn, tái dùng giao diện Page và lấy người nhận từ snapshot đơn; kiểm thử đủ/thiếu/lỗi kho, chống trùng và quyền.
2. Khóa ma trận entry/action/data-scope và nghiệm thu vai trò thực tế, bàn giao/nghỉ việc/thu hồi quyền liên quan các kho mới; không thay scope bằng cách chỉ ẩn nút.
3. Nghiệm thu file Google thật và nội dung cấu hình video/quà/hỗ trợ; rà vận hành đơn nợ/hết giữ hàng sau khi chính sách được chốt.
4. Chính sách và engine hoa hồng nội dung/affiliate/quyền lợi quản lý theo từng kỳ, rồi đối soát/duyệt chi.
5. Lần lượt nhóm Skill → khóa học → thuê bao, theo yêu cầu mở nâng cấp của người dùng. Meta/sync tiếp tục cách ly.

Tất cả bước trên đang tạm dừng. Không dùng kế hoạch này làm ủy quyền tự tiếp tục phát triển hoặc phát sinh giao dịch, sharing Google, quyền Facebook, email hay cron.
