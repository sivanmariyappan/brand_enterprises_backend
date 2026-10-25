import * as invoiceService from "../services/invoiceService.js";
import * as returnService from "../services/returnService.js";
import * as reportService from "../services/reportService.js";

const ok = (response, data, status = 200) => response.status(status).json({ success: true, data });
const okPaged = (response, result) => response.json({ success: true, ...result });

// Invoices
export async function createInvoice(request, response) {
  ok(response, await invoiceService.createInvoice(request.body, request.user), 201);
}
export async function listInvoices(request, response) {
  okPaged(response, await invoiceService.listInvoices(request.query));
}
export async function listInvoiceOptions(request, response) {
  ok(response, await invoiceService.listInvoiceOptions(request.query));
}
export async function nextInvoiceNumber(request, response) {
  ok(response, await invoiceService.previewNextNumber(request.query.channel));
}
export async function getInvoice(request, response) {
  ok(response, await invoiceService.getInvoice(request.params.id));
}
export async function addPayment(request, response) {
  ok(response, await invoiceService.addPayment(request.params.id, request.body, request.user));
}
export async function cancelInvoice(request, response) {
  ok(response, await invoiceService.cancelInvoice(request.params.id, request.body.reason, request.user));
}

// Returns
export async function createReturn(request, response) {
  ok(response, await returnService.createReturn(request.params.id, request.body, request.user), 201);
}
export async function listReturns(request, response) {
  okPaged(response, await returnService.listReturns(request.query));
}

// Reports
export async function dashboard(request, response) {
  ok(response, await reportService.getDashboard(request.user.role));
}
export async function summary(request, response) {
  ok(response, await reportService.getSummary(request.query));
}
export async function salesTrend(request, response) {
  ok(response, await reportService.getSalesTrend(request.query));
}
export async function productSales(request, response) {
  ok(response, await reportService.getProductSales(request.query));
}
export async function paymentSplit(request, response) {
  ok(response, await reportService.getPaymentSplit(request.query));
}
