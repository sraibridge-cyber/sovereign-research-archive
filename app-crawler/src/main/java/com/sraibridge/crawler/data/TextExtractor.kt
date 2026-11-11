package com.sraibridge.crawler.data

import java.security.MessageDigest

/**
 * Extracts plaintext from various file formats downloaded from Drive.
 * Uses Android's built-in parsers where possible.
 */
object TextExtractor {

    data class ExtractedDocument(
        val title: String,
        val contentPlain: String,
        val sha3_512: String,
        val fileType: String,
        val wordCount: Int
    )

    fun extract(
        fileBytes: ByteArray,
        fileName: String,
        mimeType: String
    ): ExtractedDocument {
        val fileType = mimeTypeToExtension(mimeType, fileName)
        val title = fileName.substringBeforeLast(".")

        val contentPlain = when {
            mimeType.contains("text/plain") -> String(fileBytes)
            mimeType.contains("text/html") -> extractHtml(String(fileBytes))
            mimeType.contains("pdf") -> extractPdfPlaceholder(fileBytes)
            mimeType.contains("document") -> extractDocxPlaceholder(fileBytes)
            else -> String(fileBytes) // fallback
        }

        val sha3 = sha3_512(fileBytes)
        val wordCount = contentPlain.split(Regex("\\s+")).size

        return ExtractedDocument(
            title = title,
            contentPlain = contentPlain,
            sha3_512 = sha3,
            fileType = fileType,
            wordCount = wordCount
        )
    }

    private fun mimeTypeToExtension(mimeType: String, fileName: String): String {
        return when {
            mimeType.contains("pdf") -> "pdf"
            mimeType.contains("text/plain") -> "txt"
            mimeType.contains("text/html") -> "html"
            mimeType.contains("document") -> "docx"
            mimeType.contains("spreadsheet") -> "xlsx"
            mimeType.contains("presentation") -> "pptx"
            fileName.contains(".") -> fileName.substringAfterLast(".")
            else -> "bin"
        }
    }

    private fun extractHtml(html: String): String {
        return html
            .replace(Regex("<style[^>]*>[\\s\\S]*?</style>", RegexOption.IGNORE_CASE), "")
            .replace(Regex("<script[^>]*>[\\s\\S]*?</script>", RegexOption.IGNORE_CASE), "")
            .replace(Regex("<[^>]+>"), " ")
            .replace(Regex("&[a-zA-Z]+;"), " ")
            .replace(Regex("\\s+"), " ")
            .trim()
    }

    private fun extractPdfPlaceholder(bytes: ByteArray): String {
        // Extract text between PDF text objects (BT...ET)
        val raw = String(bytes, Charsets.ISO_8859_1)
        val sb = StringBuilder()
        val btRegex = Regex("BT\\s*([\\s\\S]*?)\\s*ET")
        btRegex.findAll(raw).forEach { match ->
            val block = match.groupValues[1]
            // Extract parenthesized strings
            val parenRegex = Regex("\\(([^)]*)\\)")
            parenRegex.findAll(block).forEach { p ->
                sb.append(p.groupValues[1]).append(" ")
            }
        }
        return sb.toString().trim().ifEmpty {
            // Fallback: try to extract any readable text
            raw.replace(Regex["[^\\x20-\\x7E\\x0A\\x0D]+"), " ")
                .replace(Regex("\\s+"), " ")
                .trim()
        }
    }

    private fun extractDocxPlaceholder(bytes: ByteArray): String {
        // DOCX is a ZIP containing word/document.xml
        return try {
            val zis = java.util.zip.ZipInputStream(bytes.inputStream())
            var entry = zis.nextEntry
            while (entry != null) {
                if (entry.name == "word/document.xml") {
                    val xml = zis.readBytes().toString(Charsets.UTF_8)
                    return extractHtml(xml)
                }
                zis.closeEntry()
                entry = zis.nextEntry
            }
            zis.close()
            ""
        } catch (_: Exception) {
            ""
        }
    }

    private fun sha3_512(data: ByteArray): String {
        val digest = MessageDigest.getInstance("SHA3-512")
        val hashBytes = digest.digest(data)
        return hashBytes.joinToString("") { "%02x".format(it) }
    }
}
