import toast from "react-hot-toast"

import { UploadFile } from "~/lib/upload-file"

import { ICommand, wrapExecute } from "."

export const Image: ICommand = {
  name: "upload-image",
  label: "Upload Image",
  icon: "i-mingcute:photo-album-line",
  execute: ({ view }) => {
    const input = document.createElement("input")
    input.type = "file"
    input.addEventListener("change", async (e: any) => {
      const toastId = toast.loading("Uploading...")

      const file = e.target?.files?.[0]
      try {
        const { key } = await UploadFile(file)
        wrapExecute({ view, prepend: "", append: `![${file.name}](${key})` })

        toast.success("Uploaded!", {
          id: toastId,
        })
      } catch (error) {
        if (error instanceof Error) {
          toast.error(error.message, { id: toastId })
        }
      } finally {
        input.remove()
      }
    })
    input.click()
  },
}
