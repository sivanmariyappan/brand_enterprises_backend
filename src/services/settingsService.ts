import Setting from "../models/Setting.js";

const EDITABLE = ["shopName", "address", "phone", "email", "gstin", "shopStateCode", "invoiceFooter"];

export async function getSettings(transaction) {
  const [settings] = await Setting.findOrCreate({ where: { id: 1 }, defaults: { id: 1 }, transaction });
  return settings;
}

export async function updateSettings(input) {
  const settings = await getSettings();
  const changes = Object.fromEntries(EDITABLE.filter((key) => key in input).map((key) => [key, input[key]]));
  return settings.update(changes);
}
