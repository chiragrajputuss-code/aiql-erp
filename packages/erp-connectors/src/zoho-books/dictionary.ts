import type { EntityLists } from "../types";
import type { ZohoBooksConnector } from "./auth";

interface ZohoContact {
  contact_id:   string;
  contact_name: string;
  contact_type: string; // "vendor" | "customer"
  status:       string; // "active" | "inactive"
}

interface ZohoContactsResponse {
  contacts: ZohoContact[];
}

/**
 * Pull all active contacts from Zoho Books and classify by contact_type.
 * Zoho makes this easy — contact_type is "vendor" or "customer" directly.
 */
export async function getZohoEntityLists(connector: ZohoBooksConnector): Promise<EntityLists> {
  // Fetch all contacts — Zoho paginates at 200 per page
  const vendors:   string[] = [];
  const customers: string[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const data = await connector.get<ZohoContactsResponse>("/contacts", {
      status:       "active",
      contact_type: "vendor,customer",
      page:         String(page),
      per_page:     "200",
    });

    const contacts = data.contacts ?? [];
    for (const c of contacts) {
      if (!c.contact_name?.trim()) continue;
      if (c.contact_type === "vendor")   vendors.push(c.contact_name.trim());
      if (c.contact_type === "customer") customers.push(c.contact_name.trim());
    }

    hasMore = contacts.length === 200;
    page++;

    // Safety: don't loop more than 10 pages (2000 contacts is plenty)
    if (page > 10) break;
  }

  return { vendors, customers, employees: [] };
}
