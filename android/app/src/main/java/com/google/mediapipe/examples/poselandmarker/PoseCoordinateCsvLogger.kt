package com.google.mediapipe.examples.poselandmarker

import android.content.Context
import android.content.ContentValues
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import com.google.mediapipe.tasks.components.containers.NormalizedLandmark
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.poselandmarker.PoseLandmarkerResult
import java.io.BufferedWriter
import java.io.File
import java.io.OutputStreamWriter
import java.util.Locale

/** Writes pose landmarks as CSV rows so results can be analyzed offline. */
class PoseCoordinateCsvLogger(private val context: Context) {

    private var sessionId: Long? = null
    private var writer: BufferedWriter? = null
    private var outputLocation: String? = null

    @Synchronized
    fun startNewSession(runningMode: RunningMode): String? {
        close()

        val newSessionId = System.currentTimeMillis()
        val fileName = String.format(
            Locale.US,
            "pose_coordinates_%s_%d.csv",
            runningMode.name.lowercase(Locale.US),
            newSessionId
        )

        val bufferedWriter = createWriter(fileName) ?: return null

        bufferedWriter.append(CSV_HEADER)
        bufferedWriter.newLine()
        bufferedWriter.flush()

        sessionId = newSessionId
        writer = bufferedWriter
        outputLocation = "$PUBLIC_LOG_DIRECTORY/$fileName"

        return outputLocation
    }

    @Synchronized
    fun appendResult(
        runningMode: RunningMode,
        frameIndex: Long,
        timestampMs: Long,
        result: PoseLandmarkerResult
    ) {
        val activeWriter = writer ?: return
        val activeSessionId = sessionId ?: return

        result.landmarks().forEachIndexed { poseIndex, landmarks ->
            landmarks.forEachIndexed { landmarkIndex, landmark ->
                activeWriter.append(
                    buildCsvRow(
                        activeSessionId,
                        runningMode,
                        frameIndex,
                        timestampMs,
                        poseIndex,
                        landmarkIndex,
                        landmark
                    )
                )
                activeWriter.newLine()
            }
        }
    }

    @Synchronized
    fun close() {
        writer?.flush()
        writer?.close()
        writer = null
        outputLocation = null
        sessionId = null
    }

    @Synchronized
    fun getOutputFilePath(): String? = outputLocation

    private fun createWriter(fileName: String): BufferedWriter? {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val values = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, fileName)
                put(MediaStore.MediaColumns.MIME_TYPE, "text/csv")
                put(MediaStore.MediaColumns.RELATIVE_PATH, PUBLIC_LOG_DIRECTORY)
            }
            val uri = context.contentResolver.insert(
                MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                values
            ) ?: return null

            val outputStream = context.contentResolver.openOutputStream(uri) ?: return null
            BufferedWriter(OutputStreamWriter(outputStream))
        } else {
            val parentDir = context.getExternalFilesDir(LOG_DIRECTORY_NAME) ?: context.filesDir
            if (!parentDir.exists() && !parentDir.mkdirs()) {
                return null
            }

            File(parentDir, fileName).bufferedWriter()
        }
    }

    private fun buildCsvRow(
        sessionId: Long,
        runningMode: RunningMode,
        frameIndex: Long,
        timestampMs: Long,
        poseIndex: Int,
        landmarkIndex: Int,
        landmark: NormalizedLandmark
    ): String {
        return String.format(
            Locale.US,
            "%d,%s,%d,%d,%d,%d,%.6f,%.6f,%.6f",
            sessionId,
            runningMode.name,
            frameIndex,
            timestampMs,
            poseIndex,
            landmarkIndex,
            landmark.x(),
            landmark.y(),
            landmark.z()
        )
    }

    companion object {
        private const val LOG_DIRECTORY_NAME = "pose_logs"
        val PUBLIC_LOG_DIRECTORY = "${Environment.DIRECTORY_DOWNLOADS}/pose_logs"
        private const val CSV_HEADER =
            "session_id,mode,frame_index,timestamp_ms,pose_index,landmark_index,x,y,z"
    }
}

