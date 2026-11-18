package com.sraibridge.sovereign.ghost

import android.content.Context
import android.util.Log
import org.json.JSONObject
import org.mozilla.javascript.Context as RhinoContext
import org.mozilla.javascript.ScriptableObject

/**
 * Loads and runs the GHOST kernel (ghost_kernel.js) on Android using Mozilla Rhino
 * (no V8 dependency, no network). build_apk.sh copies src/ghost_kernel.js into the
 * app assets before the Gradle build.
 *
 * The kernel exposes `createKernel()` through `module.exports`; this adapter creates one
 * in-memory kernel (persist: false) and talks to it through `kernel.dispatch({action, payload})`,
 * which returns JSON. GHOST runs in IN-PROCESS dispatch mode — no port binding.
 *
 * Rhino contexts are bound to the thread that entered them: call every method from the
 * same thread that called [loadKernel].
 */
class GhostKernelAdapter(private val appContext: Context) {

    companion object {
        private const val TAG = "GhostKernel"
        private const val KERNEL_ASSET = "ghost_kernel.js"
        private const val BOOTSTRAP = "var module = { exports: {} };"
        private const val CREATE = "var __ghost = module.exports.createKernel({ persist: false });"
    }

    private var rhinoContext: RhinoContext? = null
    private var scope: ScriptableObject? = null
    private var kernelLoaded = false

    data class GhostResult(
        val action: String,
        val ok: Boolean,
        /** The kernel's full reply, as JSON. */
        val json: String
    )

    /**
     * Load the GHOST kernel from assets and create an in-memory kernel instance.
     */
    fun loadKernel(): Boolean {
        return try {
            val cx = RhinoContext.enter()
            rhinoContext = cx  // set first, so release() exits the context if loading fails
            cx.optimizationLevel = -1  // interpretive mode for Android
            cx.languageVersion = RhinoContext.VERSION_ES6
            val s = cx.initStandardObjects()

            val kernelJs = appContext.assets.open(KERNEL_ASSET)
                .bufferedReader().use { it.readText() }

            cx.evaluateString(s, BOOTSTRAP, "bootstrap", 1, null)
            cx.evaluateString(s, kernelJs, KERNEL_ASSET, 1, null)
            cx.evaluateString(s, CREATE, "create", 1, null)

            scope = s
            kernelLoaded = true
            Log.i(TAG, "GHOST kernel loaded: ${evaluate("module.exports.version")}")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to load GHOST kernel", e)
            release()
            false
        }
    }

    /**
     * Dispatch an action (for example "ingest" or "ping") with a JSON payload.
     */
    fun dispatch(action: String, payloadJson: String = "{}"): GhostResult? {
        if (!kernelLoaded) {
            Log.w(TAG, "dispatch called before kernel loaded")
            return null
        }
        return try {
            val s = scope ?: return null
            ScriptableObject.putProperty(s, "__action", action)
            ScriptableObject.putProperty(s, "__payload", payloadJson)
            val json = evaluate(
                "JSON.stringify(__ghost.dispatch({ action: __action, payload: JSON.parse(__payload) }))"
            )
            GhostResult(action, JSONObject(json).optBoolean("ok", false), json)
        } catch (e: Exception) {
            Log.e(TAG, "dispatch failed", e)
            null
        }
    }

    /**
     * Merkle root over the kernel's long-term memory, computed by the kernel itself.
     */
    fun getSeal(): String =
        if (kernelLoaded) evaluate("module.exports.computeMerkleRoot(__ghost.ltmStore)") else ""

    /**
     * Check a document's text against the SHA3-512 stored in archive.db (documents.sha3_512).
     * Uses the kernel's own SHA3-512, because Android's MessageDigest does not offer SHA3 on
     * every API level the app supports.
     */
    fun verifyDocument(content: String, expectedHash: String): Boolean {
        if (!kernelLoaded) return false
        val s = scope ?: return false
        ScriptableObject.putProperty(s, "__text", content)
        val actual = evaluate("module.exports.sha3_512(__text)")
        return actual.equals(expectedHash, ignoreCase = true)
    }

    fun release() {
        if (rhinoContext != null) {
            try {
                RhinoContext.exit()
            } catch (_: Exception) {
            }
        }
        rhinoContext = null
        scope = null
        kernelLoaded = false
    }

    private fun evaluate(script: String): String {
        val cx = rhinoContext ?: error("kernel not loaded")
        val s = scope ?: error("kernel not loaded")
        return RhinoContext.toString(cx.evaluateString(s, script, "adapter", 1, null))
    }
}
