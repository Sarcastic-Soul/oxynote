import { mountSuspended } from "@nuxt/test-utils/runtime"
import { afterEach, beforeEach, describe, it, vi } from "vitest"
import { toast } from "vue-sonner"
import {
	clearQueryCache,
	disposeMockEndpoints,
	mockEndpoint,
	runInApp,
} from "~/composables/api/test-helpers"
import {
	stubSelectableColors,
	stubThemeColorContext,
} from "../editor/test-helpers/theme"
import ColorSelect from "../ColorSelect.vue"
import {
	at,
	clearTeleportedOverlays,
	emitFrom,
	findButtonByText,
	raisedToasts,
	WAIT_FOR_OPTIONS,
	t,
} from "../test-helpers"
import GroupForm from "./GroupForm.vue"
import { useGroupOpenState } from "./group-state"
import { GROUP_DEPLOYS, GROUP_ENV, fullTree, mockTree } from "./test-helpers"

vi.mock("vue-sonner", () => ({
	toast: { custom: vi.fn(), dismiss: vi.fn() },
}))

const GROUPS_URL = "/api/variables/groups"

let palette: string[] = []

// the palette lives on the shared document element, and the query cache,
// the mocked toast and the popover teleported into <body> are shared by
// every mount
describe("<GroupForm>", { concurrent: false }, () => {
	beforeEach(() => {
		clearQueryCache()
		clearTeleportedOverlays()
		vi.mocked(toast.custom).mockClear()
		stubThemeColorContext()
		palette = stubSelectableColors()
	})
	afterEach(disposeMockEndpoints)

	it("creates a group with its name and the default colour", async ({
		expect,
	}) => {
		mockTree(fullTree())
		const calls = mockEndpoint("POST", GROUPS_URL, () => ({ id: "grp-new" }))
		const wrapper = await mountForm(null)

		await wrapper.get("input").setValue("Incidents")
		await wrapper.get("form").trigger("submit")
		await waitForValidation(() => {
			expect(wrapper.emitted("close")).toHaveLength(1)
		})

		expect
			.soft(runInApp(() => useGroupOpenState().created.value))
			.toContain("grp-new")
		// the canvas stand-in reads every colour back as black
		expect
			.soft(calls.map((call) => call.body))
			.toEqual([{ groupName: "Incidents", color: "#000000" }])
		expect.soft(wrapper.emitted("close")).toHaveLength(1)
	})

	it("shows the colour picked in the palette on its anchor", async ({
		expect,
	}) => {
		const wrapper = await mountForm(null)
		await findButtonByText(
			wrapper,
			t("variable.group-form.color-button"),
		).trigger("click")

		emitFrom(wrapper, ColorSelect, "update:modelValue", at(palette, 3))
		await nextTick()

		expect(
			wrapper.get("button span.rounded-full").attributes("style"),
		).toContain(`background-color: ${at(palette, 3)}`)
	})

	it("saves an edited group", async ({ expect }) => {
		mockTree(fullTree())
		const calls = mockEndpoint(
			"PUT",
			`${GROUPS_URL}/${GROUP_DEPLOYS}`,
			() => null,
		)
		const wrapper = await mountForm(GROUP_DEPLOYS)

		await wrapper.get("input").setValue("Releases")
		await wrapper.get("form").trigger("submit")
		await waitForValidation(() => {
			expect(wrapper.emitted("close")).toHaveLength(1)
		})

		expect
			.soft(calls.map((call) => call.body))
			.toEqual([{ groupName: "Releases", color: "#000000" }])
	})

	it("flags a name another group already has", async ({ expect }) => {
		const calls = mockEndpoint("POST", GROUPS_URL, () => ({}))
		const wrapper = await mountForm(null)
		await wrapper.get("input").setValue("Environment")

		await wrapper.get("form").trigger("submit")

		await waitForValidation(() => {
			expect(wrapper.text()).toContain(t("variable.group-form.name-taken"))
		})
		expect.soft(calls).toHaveLength(0)
	})

	it("asks for a name before it creates a group", async ({ expect }) => {
		const calls = mockEndpoint("POST", GROUPS_URL, () => ({}))
		const wrapper = await mountForm(null)

		await wrapper.get("form").trigger("submit")

		await waitForValidation(() => {
			expect(wrapper.text()).toContain(t("variable.group-form.name-required"))
		})
		expect.soft(calls).toHaveLength(0)
	})

	it("explains that a group with variables must be emptied first", async ({
		expect,
	}) => {
		const wrapper = await mountForm(GROUP_ENV)

		expect(wrapper.text()).toContain(
			t("variable.group-form.delete-blocked-hint", { count: 2 }),
		)
	})

	it("says an empty group can be deleted cleanly", async ({ expect }) => {
		const wrapper = await mountForm(GROUP_DEPLOYS)

		expect(wrapper.text()).toContain(t("variable.group-form.delete-clean-hint"))
	})

	it("asks to delete the group", async ({ expect }) => {
		const wrapper = await mountForm(GROUP_ENV)

		await findButtonByText(
			wrapper,
			t("variable.group-form.delete-button"),
		).trigger("click")

		expect(wrapper.emitted("delete")?.[0]?.[0]).toMatchObject({
			id: GROUP_ENV,
			variables: [expect.anything(), expect.anything()],
		})
	})

	it("offers no delete while creating", async ({ expect }) => {
		const wrapper = await mountForm(null)

		expect(wrapper.text()).not.toContain(t("variable.group-form.delete-button"))
	})

	it("raises a toast when the group cannot be saved", async ({ expect }) => {
		mockTree(fullTree())
		const calls = mockEndpoint("POST", GROUPS_URL, () => {
			throw createError({ statusCode: 500 })
		})
		const wrapper = await mountForm(null)
		await wrapper.get("input").setValue("Incidents")

		await wrapper.get("form").trigger("submit")

		await waitForValidation(() => {
			expect(raisedToasts()).toHaveLength(1)
		})
		expect.soft(calls).toHaveLength(1)
		expect.soft(wrapper.emitted("close")).toBeUndefined()
		expect.soft(raisedToasts()).toEqual([
			expect.objectContaining({
				type: "error",
				title: t("variable.errors.group-save-failed"),
			}),
		])
	})

	it("goes back from its header while nothing was changed", async ({
		expect,
	}) => {
		const calls = mockEndpoint(
			"PUT",
			`${GROUPS_URL}/${GROUP_DEPLOYS}`,
			() => null,
		)
		const wrapper = await mountForm(GROUP_DEPLOYS)

		await findButtonByText(wrapper, t("variable.actions.back")).trigger("click")

		expect(wrapper.emitted("close")).toHaveLength(1)
		expect.soft(calls).toHaveLength(0)
	})
})

function mountForm(groupId: string | null) {
	return mountSuspended(GroupForm, {
		props: { tree: fullTree(), groupId: groupId },
	})
}

// a submit runs vee-validate's validation first, on its own scheduler,
// and nothing signals when that is done
function waitForValidation(check: () => void) {
	return vi.waitFor(check, WAIT_FOR_OPTIONS)
}
