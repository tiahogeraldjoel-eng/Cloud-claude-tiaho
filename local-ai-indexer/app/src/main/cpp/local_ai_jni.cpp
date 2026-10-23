#include <jni.h>
#include <string>
#include <vector>
#include <algorithm>
#include <android/log.h>
#include "llama.h"
#include "ggml.h"
#include "ggml-backend.h"

#define LOG_TAG "LlamaBridge"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

namespace {

bool g_backend_ready = false;

void ensure_backend() {
    if (!g_backend_ready) {
        llama_backend_init();
        ggml_backend_load_all();
        g_backend_ready = true;
    }
}

}  // namespace

extern "C" JNIEXPORT jlong JNICALL
Java_com_example_localaiindexer_LlamaBridge_loadModel(JNIEnv *env, jobject /*thiz*/, jstring modelPath) {
    ensure_backend();

    const char *path = env->GetStringUTFChars(modelPath, nullptr);

    llama_model_params model_params = llama_model_default_params();
    model_params.n_gpu_layers = 0;  // CPU inference on-device

    llama_model *model = llama_model_load_from_file(path, model_params);

    if (model == nullptr) {
        LOGE("Echec du chargement du modele: %s", path);
    } else {
        LOGI("Modele charge: %s", path);
    }

    env->ReleaseStringUTFChars(modelPath, path);
    return reinterpret_cast<jlong>(model);
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_example_localaiindexer_LlamaBridge_generateResponse(JNIEnv *env, jobject /*thiz*/, jlong modelPtr, jstring promptStr) {
    if (modelPtr == 0) {
        return env->NewStringUTF("[Erreur] Modele non charge.");
    }

    auto *model = reinterpret_cast<llama_model *>(modelPtr);
    const llama_vocab *vocab = llama_model_get_vocab(model);

    const char *prompt_chars = env->GetStringUTFChars(promptStr, nullptr);
    std::string prompt(prompt_chars);
    env->ReleaseStringUTFChars(promptStr, prompt_chars);

    const int n_predict = 256;

    int n_prompt = -llama_tokenize(vocab, prompt.c_str(), (int) prompt.size(), nullptr, 0, true, true);
    if (n_prompt <= 0) {
        return env->NewStringUTF("[Erreur] Prompt vide ou invalide.");
    }

    std::vector<llama_token> prompt_tokens(n_prompt);
    if (llama_tokenize(vocab, prompt.c_str(), (int) prompt.size(),
                        prompt_tokens.data(), (int) prompt_tokens.size(), true, true) < 0) {
        return env->NewStringUTF("[Erreur] Echec de la tokenisation.");
    }

    llama_context_params ctx_params = llama_context_default_params();
    ctx_params.n_ctx = n_prompt + n_predict + 32;
    ctx_params.n_batch = std::max(n_prompt, 512);
    ctx_params.no_perf = true;

    llama_context *ctx = llama_init_from_model(model, ctx_params);
    if (ctx == nullptr) {
        return env->NewStringUTF("[Erreur] Echec de creation du contexte d'inference.");
    }

    llama_sampler_chain_params sparams = llama_sampler_chain_default_params();
    sparams.no_perf = true;
    llama_sampler *smpl = llama_sampler_chain_init(sparams);
    llama_sampler_chain_add(smpl, llama_sampler_init_greedy());

    std::string result;
    llama_batch batch = llama_batch_get_one(prompt_tokens.data(), (int) prompt_tokens.size());

    int n_pos = 0;
    while (n_pos + batch.n_tokens < n_prompt + n_predict) {
        if (llama_decode(ctx, batch) != 0) {
            LOGE("llama_decode a echoue");
            break;
        }
        n_pos += batch.n_tokens;

        llama_token new_token_id = llama_sampler_sample(smpl, ctx, -1);
        if (llama_vocab_is_eog(vocab, new_token_id)) {
            break;
        }

        char buf[256];
        int n = llama_token_to_piece(vocab, new_token_id, buf, sizeof(buf), 0, true);
        if (n < 0) {
            break;
        }
        result.append(buf, n);

        batch = llama_batch_get_one(&new_token_id, 1);
    }

    llama_sampler_free(smpl);
    llama_free(ctx);

    if (result.empty()) {
        result = "[Aucune reponse generee]";
    }

    return env->NewStringUTF(result.c_str());
}

extern "C" JNIEXPORT void JNICALL
Java_com_example_localaiindexer_LlamaBridge_freeModel(JNIEnv *env, jobject /*thiz*/, jlong modelPtr) {
    if (modelPtr != 0) {
        auto *model = reinterpret_cast<llama_model *>(modelPtr);
        llama_model_free(model);
    }
}
