// Run the suites in-process: this also supports sandboxes without IPC sockets.
// Keep this order so the existing shared suite lifecycle remains unchanged.
import "./unit/reporting.test";
import "./integration/database.test";
import "./unit/offline.test";
import "./unit/demo.test";
import "./integration/simple-database.test";
import "./integration/simple-local.test";
import "./unit/site-time.test";
import "./unit/delivery-records.test";
import "./unit/access.test";
import "./unit/catalogue.test";
import "./unit/smart-arrivals.test";
import "./unit/smart-drafts.test";
import "./integration/live-database.test";
import "./unit/config.test";
import "./unit/provision-site.test";
import "./unit/supervisor-workspace.test";
