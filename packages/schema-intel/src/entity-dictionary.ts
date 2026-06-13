import type { ERPConnector }    from "@aiql/erp-connectors";
import type { EntityDictionary } from "@aiql/tokeniser";

/**
 * Pull vendor/customer/employee lists from the ERP connector and
 * return them in the format expected by the tokeniser.
 *
 * This is the bridge between the ERP connector layer and the tokeniser:
 *   connector.getEntityLists() → EntityDictionary → tokenise(text, config, dictionary)
 */
export async function buildEntityDictionary(
  connector: ERPConnector
): Promise<EntityDictionary> {
  const lists = await connector.getEntityLists();
  return {
    vendors:   lists.vendors,
    customers: lists.customers,
    employees: lists.employees,
  };
}
