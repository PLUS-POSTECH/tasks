import { revalidatePath } from "next/cache";

/**
 * Every mutation invalidates the whole app: pages share sidebar counts, pickers
 * and lists, and the data set is small enough that precision is not worth it.
 */
export const revalidateEverything = (): void => revalidatePath("/", "layout");
