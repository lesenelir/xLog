"use client"

import { nanoid } from "nanoid"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { ChangeEvent, memo, useCallback, useEffect, useState } from "react"
import toast from "react-hot-toast"
import { shallow } from "zustand/shallow"

import type { EditorView } from "@codemirror/view"
import { DateInput } from "@mantine/dates"
import { useQueryClient } from "@tanstack/react-query"

import { DashboardMain } from "~/components/dashboard/DashboardMain"
import DualColumnEditor from "~/components/dashboard/DualColumnEditor"
import { EditorToolbar } from "~/components/dashboard/EditorToolbar"
import { OptionsButton } from "~/components/dashboard/OptionsButton"
import { PublishButton } from "~/components/dashboard/PublishButton"
import PublishedModal from "~/components/dashboard/PublishedModal"
import { Button } from "~/components/ui/Button"
import { FieldLabel } from "~/components/ui/FieldLabel"
import { ImageUploader } from "~/components/ui/ImageUploader"
import { Input } from "~/components/ui/Input"
import { useModalStack } from "~/components/ui/ModalStack"
import { Switch } from "~/components/ui/Switch"
import { TagInput } from "~/components/ui/TagInput"
import { UniLink } from "~/components/ui/UniLink"
import {
  Values,
  initialEditorState,
  useEditorState,
} from "~/hooks/useEditorState"
import { useGetState } from "~/hooks/useGetState"
import { useIsMobileLayout } from "~/hooks/useMobileLayout"
import { useBeforeMounted } from "~/hooks/useSyncOnce"
import { showConfetti } from "~/lib/confetti"
import { RESERVED_TAGS } from "~/lib/constants"
import { getDefaultSlug } from "~/lib/default-slug"
import { CSB_SCAN } from "~/lib/env"
import { getSiteLink, getTwitterShareUrl } from "~/lib/helpers"
import { useTranslation } from "~/lib/i18n/client"
import { getPageVisibility } from "~/lib/page-helpers"
import { delStorage, setStorage } from "~/lib/storage"
import { ExpandedNote, NoteType, PageVisibilityEnum } from "~/lib/types"
import { cn, pick } from "~/lib/utils"
import { checkPageSlug } from "~/models/page.model"
import {
  useCreatePage,
  useDeletePage,
  useGetDistinctNoteTagsOfCharacter,
  useGetPage,
  useUpdatePage,
} from "~/queries/page"
import { useGetSite } from "~/queries/site"

export default function PostEditor() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { t } = useTranslation("dashboard")
  const params = useParams()
  const subdomain = params?.subdomain as string
  const searchParams = useSearchParams()

  let pageId = searchParams?.get("id") as string | undefined
  const type = (searchParams?.get("type") || "post") as NoteType
  const defaultTag = searchParams?.get("tag")

  const site = useGetSite(subdomain)

  const [draftKey, setDraftKey] = useState<string>("")
  useEffect(() => {
    if (subdomain) {
      let key
      if (!pageId) {
        const randomId = nanoid()
        key = `draft-${site.data?.characterId}-!local-${randomId}`
        setDraftKey(key)
        queryClient.invalidateQueries([
          "getPagesBySite",
          site.data?.characterId,
        ])
        router.replace(
          `/dashboard/${subdomain}/editor?id=!local-${randomId}&type=${searchParams?.get(
            "type",
          )}${
            searchParams?.get("tag") ? "&tag=" + searchParams?.get("tag") : ""
          }`,
        )
      } else {
        key = `draft-${site.data?.characterId}-${pageId}`
      }
      setDraftKey(key)
      setDefaultSlug(
        key
          .replace(`draft-${site.data?.characterId}-!local-`, "")
          .replace(`draft-${site.data?.characterId}-`, ""),
      )
    }
  }, [
    subdomain,
    pageId,
    queryClient,
    router,
    site.data?.characterId,
    searchParams,
  ])

  const page = useGetPage({
    characterId: site.data?.characterId,
    noteId: pageId && /\d+/.test(pageId) ? +pageId : undefined,
    slug: pageId || draftKey.replace(`draft-${site.data?.characterId}-`, ""),
    handle: subdomain,
  })

  const userTags = useGetDistinctNoteTagsOfCharacter(site.data?.characterId)

  const [visibility, setVisibility] = useState<PageVisibilityEnum>()

  useEffect(() => {
    if (page.isSuccess) {
      setVisibility(getPageVisibility(page.data || undefined))
    }
  }, [page.isSuccess, page.data])

  // reset editor state when page changes
  useBeforeMounted(() => {
    useEditorState.setState({
      ...initialEditorState,
      tags: defaultTag || "",
    })
  })

  const values = useEditorState()

  const [initialContent, setInitialContent] = useState("")
  const [defaultSlug, setDefaultSlug] = useState("")

  const getValues = useGetState(values)
  const getDraftKey = useGetState(draftKey)

  const updateValue = useCallback(
    <K extends keyof Values>(key: K, value: Values[K]) => {
      if (visibility !== PageVisibilityEnum.Draft) {
        setVisibility(PageVisibilityEnum.Modified)
      }

      const values = getValues()
      const draftKey = getDraftKey()
      if (key === "title") {
        setDefaultSlug(
          getDefaultSlug(
            value as string,
            draftKey.replace(`draft-${site.data?.characterId}-`, ""),
          ),
        )
      }
      if (key === "slug" && !/^[a-zA-Z0-9\-_]*$/.test(value as string)) {
        // Replace all invalid chars
        ;(value as string) = (value as string).replace(/[^\w\-]/g, "-")
        toast.error(
          t(
            "Slug can only contain letters, numbers, hyphens, and underscores.",
          ),
        )
      }
      const newValues = { ...values, [key]: value }
      if (draftKey) {
        setStorage(draftKey, {
          date: +new Date(),
          values: newValues,
          type,
        })
        queryClient.invalidateQueries([
          "getPagesBySite",
          site.data?.characterId,
        ])
      }
      useEditorState.setState(newValues)
    },
    [type, queryClient, subdomain, visibility],
  )

  const isMobileLayout = useIsMobileLayout()
  const [isRendering, setIsRendering] = useState(!isMobileLayout)

  // Save
  const createPage = useCreatePage()
  const updatePage = useUpdatePage()
  const savePage = async () => {
    const check = await checkPageSlug({
      slug: values.slug || defaultSlug,
      characterId: site.data?.characterId,
      noteId: page?.data?.noteId,
    })
    if (check) {
      toast.error(check)
    } else {
      const uniqueTags = Array.from(new Set(values.tags.split(","))).join(",")

      const baseValues = {
        ...values,
        tags: uniqueTags,
        slug: values.slug || defaultSlug,
        characterId: site.data?.characterId,
        cover: values.cover,
        disableAISummary: values.disableAISummary,
      }
      if (visibility === PageVisibilityEnum.Draft) {
        createPage.mutate({
          ...baseValues,
          type,
        })
      } else {
        updatePage.mutate({
          ...baseValues,
          noteId: page?.data?.noteId,
        })
      }
    }
  }

  const { present } = useModalStack()

  useEffect(() => {
    if (createPage.isSuccess || updatePage.isSuccess) {
      if (draftKey) {
        delStorage(draftKey)
        queryClient.invalidateQueries([
          "getPagesBySite",
          site.data?.characterId,
        ])
        queryClient.invalidateQueries([
          "getPage",
          draftKey.replace(`draft-${site.data?.characterId}-`, ""),
        ])
      } else {
        queryClient.invalidateQueries(["getPage", pageId])
      }

      if (createPage.data?.noteId) {
        router.replace(
          `/dashboard/${subdomain}/editor?id=${createPage.data
            ?.noteId}&type=${searchParams?.get("type")}`,
        )
      }

      const postUrl = `${getSiteLink({
        subdomain,
        domain: site.data?.metadata?.content?.custom_domain,
      })}/${encodeURIComponent(values.slug || defaultSlug)}`

      const transactionUrl = `${CSB_SCAN}/tx/${
        page.data?.updatedTransactionHash || page.data?.transactionHash // TODO
      }`

      const twitterShareUrl =
        page.data && site.data
          ? getTwitterShareUrl({
              page: {
                metadata: {
                  content: {
                    slug: encodeURIComponent(values.slug || defaultSlug),
                    title: values.title,
                  },
                },
              } as ExpandedNote,
              site: site.data,
              t,
            })
          : ""

      const modalId = "publish-modal"
      present({
        title: `🎉 ${t("Published!")}`,
        id: modalId,
        content: (props) => (
          <PublishedModal
            postUrl={postUrl}
            transactionUrl={transactionUrl}
            twitterShareUrl={twitterShareUrl}
            {...props}
          />
        ),
      })

      showConfetti()

      createPage.reset()
      updatePage.reset()
    }
  }, [createPage.isSuccess, updatePage.isSuccess])

  useEffect(() => {
    if (createPage.isError || updatePage.isError) {
      toast.error("Error: " + (createPage.error || updatePage.error))
      createPage.reset()
      updatePage.reset()
    }
  }, [createPage.isError, updatePage.isSuccess])

  // Delete
  const deleteP = useDeletePage()
  const deletePage = async () => {
    if (page.data) {
      if (!page.data?.noteId) {
        // Is draft
        delStorage(`draft-${page.data.characterId}-${page.data.draftKey}`)
      } else {
        // Is Note
        return deleteP.mutate({
          noteId: page.data.noteId,
          characterId: page.data.characterId,
        })
      }
    }
  }

  useEffect(() => {
    if (deleteP.isSuccess) {
      toast.success(t("Deleted!"))
      deleteP.reset()
      router.push(`/dashboard/${subdomain}/${searchParams?.get("type")}s`)
    }
  }, [deleteP.isSuccess])

  // Init
  useEffect(() => {
    if (!page.data?.metadata?.content || !draftKey) return
    setInitialContent(page.data.metadata?.content?.content || "")
    useEditorState.setState({
      title: page.data.metadata?.content?.title || "",
      publishedAt: page.data.metadata?.content?.date_published,
      published: !!page.data.noteId,
      excerpt: page.data.metadata?.content?.summary || "",
      slug: page.data.metadata?.content?.slug || "",
      tags:
        page.data.metadata?.content?.tags
          ?.filter((tag) => !RESERVED_TAGS.includes(tag))
          ?.join(", ") || "",
      content: page.data.metadata?.content?.content || "",
      cover: page.data.metadata?.content?.attachments?.find(
        (attachment) => attachment.name === "cover",
      ) || {
        address: "",
        mime_type: "",
      },
      disableAISummary: page.data.metadata?.content?.disableAISummary,
    })
    setDefaultSlug(
      getDefaultSlug(
        page.data.metadata?.content?.title || "",
        draftKey.replace(`draft-${site.data?.characterId}-`, ""),
      ),
    )
  }, [page.data, subdomain, draftKey, site.data?.characterId])

  const [view, setView] = useState<EditorView>()

  // editor
  const onCreateEditor = useCallback(
    (view: EditorView) => {
      setView?.(view)
    },
    [setView],
  )

  const onChange = useCallback(
    (value: string) => {
      updateValue("content", value)
    },
    [updateValue],
  )

  const onPreviewButtonClick = useCallback(() => {
    window.open(
      `/site/${subdomain}/preview/${draftKey.replace(
        `draft-${site.data?.characterId}-`,
        "",
      )}`,
    )
  }, [draftKey, subdomain, site.data?.characterId])

  const extraProperties = (
    <EditorExtraProperties
      defaultSlug={defaultSlug}
      updateValue={updateValue}
      type={type}
      subdomain={subdomain}
      userTags={userTags.data?.list || []}
    />
  )

  const discardChanges = useCallback(() => {
    if (draftKey) {
      delStorage(draftKey)
      queryClient.invalidateQueries(["getPagesBySite", site.data?.characterId])
      page.remove()
      page.refetch()
    }
  }, [draftKey, site.data?.characterId])

  return (
    <>
      <DashboardMain fullWidth>
        {page.isLoading ? (
          <div className="flex justify-center items-center min-h-[300px]">
            {t("Loading")}...
          </div>
        ) : (
          <>
            <header
              className={`flex justify-between absolute top-0 left-0 right-0 z-25 px-5 h-14 border-b items-center text-sm ${
                isMobileLayout ? "w-screen" : undefined
              }`}
            >
              <div
                className={`flex items-center overflow-x-auto scrollbar-hide ${
                  isMobileLayout ? "flex-1" : undefined
                }`}
              >
                <EditorToolbar view={view}></EditorToolbar>
              </div>
              {isMobileLayout ? (
                <div className="flex items-center space-x-3 w-auto pl-5">
                  <OptionsButton
                    visibility={visibility}
                    savePage={savePage}
                    deletePage={deletePage}
                    published={visibility !== PageVisibilityEnum.Draft}
                    isRendering={isRendering}
                    renderPage={setIsRendering}
                    propertiesWidget={extraProperties}
                    previewPage={onPreviewButtonClick}
                    type={type}
                    isModified={visibility === PageVisibilityEnum.Modified}
                    discardChanges={discardChanges}
                  />
                </div>
              ) : (
                <div className="flex items-center space-x-3 flex-shrink-0">
                  <span
                    className={cn(
                      `text-sm capitalize`,
                      visibility === PageVisibilityEnum.Draft
                        ? `text-zinc-300`
                        : visibility === PageVisibilityEnum.Modified
                        ? "text-orange-600"
                        : "text-green-600",
                    )}
                  >
                    {t(visibility as string)}
                  </span>
                  <Button isAutoWidth onClick={onPreviewButtonClick}>
                    {t("Preview")}
                  </Button>
                  <PublishButton
                    savePage={savePage}
                    deletePage={deletePage}
                    twitterShareUrl={
                      page.data && site.data
                        ? getTwitterShareUrl({
                            page: page.data,
                            site: site.data,
                            t,
                          })
                        : ""
                    }
                    published={visibility !== PageVisibilityEnum.Draft}
                    isSaving={
                      createPage.isLoading ||
                      updatePage.isLoading ||
                      deleteP.isLoading
                    }
                    isDisabled={
                      visibility !== PageVisibilityEnum.Modified &&
                      visibility !== PageVisibilityEnum.Draft
                    }
                    type={type}
                    isModified={visibility === PageVisibilityEnum.Modified}
                    discardChanges={discardChanges}
                  />
                </div>
              )}
            </header>
            <div
              className={`pt-14 flex w-full ${
                isMobileLayout
                  ? "w-screen h-[calc(100vh-4rem)]"
                  : "min-w-[840px] h-screen "
              }`}
            >
              <div className="flex-1 pt-5 flex flex-col min-w-0">
                <div className="px-5 h-12">
                  <input
                    type="text"
                    name="title"
                    value={values.title}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                        view?.focus()
                      }
                    }}
                    onChange={(e) => updateValue("title", e.target.value)}
                    className="h-12 ml-1 inline-flex items-center border-none text-3xl font-bold w-full focus:outline-none bg-white"
                    placeholder={t("Title goes here...") || ""}
                  />
                </div>
                <div className="mt-5 flex-1 min-h-0">
                  <DualColumnEditor
                    initialContent={initialContent}
                    onChange={onChange}
                    onCreateEditor={onCreateEditor}
                    isRendering={isRendering}
                    setIsRendering={setIsRendering}
                  />
                </div>
              </div>
              {!isMobileLayout && extraProperties}
            </div>
          </>
        )}
      </DashboardMain>
    </>
  )
}

const EditorExtraProperties = memo(
  ({
    type,
    updateValue,
    subdomain,
    defaultSlug,
    userTags,
  }: {
    updateValue: <K extends keyof Values>(key: K, value: Values[K]) => void
    type: NoteType
    subdomain: string
    defaultSlug: string
    userTags: string[]
  }) => {
    const values = useEditorState(
      (state) =>
        pick(state, ["publishedAt", "slug", "excerpt", "tags", "cover"]),
      shallow,
    )
    const { t } = useTranslation("dashboard")
    const site = useGetSite(subdomain)

    const { present } = useModalStack()
    const openAdvancedOptions = () => {
      present({
        title: t("Advanced Settings"),
        content: () => (
          <EditorAdvancedModal type={type} updateValue={updateValue} />
        ),
        modalProps: {
          withConfirm: true,
        },
      })
    }

    return (
      <div className="h-full overflow-auto w-[280px] border-l bg-zinc-50 p-5 space-y-5">
        <div>
          <FieldLabel label={t("Cover Image")} />
          <ImageUploader
            id="icon"
            className="aspect-video rounded-lg"
            value={values.cover as any}
            hasClose={true}
            withMimeType={true}
            uploadEnd={(key) => {
              const { address, mime_type } = key as {
                address?: string
                mime_type?: string
              }
              updateValue("cover", {
                address,
                mime_type,
              })
            }}
            accept="image/*"
          />
          <div className="text-xs text-gray-400 mt-1">
            {t("Leave blank to use the first image in the post")}
          </div>
        </div>
        <div>
          <Input
            name="tags"
            value={values.tags}
            label={t("Tags") || ""}
            id="tags"
            isBlock
            renderInput={(props) => (
              <TagInput
                {...props}
                userTags={userTags}
                onTagChange={(value: string) => updateValue("tags", value)}
              />
            )}
          />
        </div>
        <div>
          <Input
            name="slug"
            value={values.slug}
            placeholder={defaultSlug}
            label={
              t(`${type.charAt(0).toUpperCase() + type.slice(1)} slug`) || ""
            }
            id="slug"
            isBlock
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              updateValue("slug", e.target.value)
            }
            help={
              <>
                {(values.slug || defaultSlug) && (
                  <>
                    {t(`This ${type} will be accessible at`)}{" "}
                    <UniLink
                      href={`${getSiteLink({
                        subdomain,
                        domain: site.data?.metadata?.content?.custom_domain,
                      })}/${encodeURIComponent(values.slug || defaultSlug)}`}
                      className="hover:underline"
                    >
                      {getSiteLink({
                        subdomain,
                        domain: site.data?.metadata?.content?.custom_domain,
                        noProtocol: true,
                      })}
                      /{encodeURIComponent(values.slug || defaultSlug)}
                    </UniLink>
                  </>
                )}
              </>
            }
          />
        </div>
        <div>
          <Input
            label={t("Excerpt") || ""}
            isBlock
            name="excerpt"
            id="excerpt"
            value={values.excerpt}
            multiline
            rows={4}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
              updateValue("excerpt", e.target.value)
            }}
            help={t("Leave it blank to use auto-generated excerpt")}
          />
        </div>
        <div>
          <Button
            variant="secondary"
            className="border"
            type="button"
            isBlock
            onClick={openAdvancedOptions}
          >
            <span className="inline-flex items-center">
              <i className="icon-[mingcute--settings-4-fill] inline-block mr-2" />
              <span>{t("Advanced Settings")}</span>
            </span>
          </Button>
        </div>
      </div>
    )
  },
)

EditorExtraProperties.displayName = "EditorExtraProperties"

const EditorAdvancedModal = ({
  type,
  updateValue,
}: {
  type: NoteType
  updateValue: <K extends keyof Values>(key: K, value: Values[K]) => void
}) => {
  const { t } = useTranslation("dashboard")

  const values = useEditorState(
    (state) => pick(state, ["disableAISummary", "publishedAt"]),
    shallow,
  )

  return (
    <div className="p-5 space-y-5">
      <div>
        <label className="form-label">
          {t("Disable AI-generated summary")}
        </label>
        <Switch
          label=""
          checked={values.disableAISummary}
          setChecked={(state) => updateValue("disableAISummary", state)}
        />
      </div>
      <div>
        <label className="form-label" htmlFor="publishAt">
          {t("Publish at")}
        </label>
        <DateInput
          className="[&_input]:text-black/90 [&_input]:bg-white"
          allowDeselect
          clearable
          valueFormat="YYYY-MM-DD, h:mm a"
          name="publishAt"
          id="publishAt"
          value={values.publishedAt ? new Date(values.publishedAt) : undefined}
          onChange={(value: Date | null) => {
            if (value) {
              updateValue("publishedAt", value.toISOString())
            } else {
              updateValue("publishedAt", "")
            }
          }}
          styles={{
            input: {
              borderRadius: "0.5rem",
              borderColor: "var(--border-color)",
              height: "2.5rem",
              "&:focus-within": {
                borderColor: "var(--theme-color)",
              },
            },
          }}
        />
        <div className="text-xs text-gray-400 mt-1">
          {t(
            `This ${type} will be accessible from this time. Leave blank to use the current time.`,
          )}
        </div>
        {values.publishedAt > new Date().toISOString() && (
          <div className="text-xs mt-1 text-orange-500">
            {t(
              "The post is currently not public as its publication date has been scheduled for a future time.",
            )}
          </div>
        )}
      </div>
    </div>
  )
}
