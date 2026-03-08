use std::collections::HashMap;
use std::sync::Arc;

use parking_lot::Mutex;
use uuid::Uuid;

use crate::types::*;

// ---------------------------------------------------------------------------
// S3 Browsing
// ---------------------------------------------------------------------------

struct S3Session {
    client: aws_sdk_s3::Client,
    bucket: String,
}

fn get_s3_client(s3_id: &str) -> Result<(aws_sdk_s3::Client, String), String> {
    let sessions = S3_SESSIONS.lock();
    let s3 = sessions.get(s3_id).ok_or("S3 session not found")?;
    Ok((s3.client.clone(), s3.bucket.clone()))
}

lazy_static::lazy_static! {
    static ref S3_SESSIONS: Arc<Mutex<HashMap<String, S3Session>>> =
        Arc::new(Mutex::new(HashMap::new()));
}

#[tauri::command]
pub async fn s3_connect(
    region: Option<String>,
    access_key: Option<String>,
    secret_key: Option<String>,
    endpoint: Option<String>,
    bucket: String,
) -> Result<String, String> {
    let region_provider = aws_sdk_s3::config::Region::new(
        region.unwrap_or_else(|| "us-east-1".to_string()),
    );

    let mut config_builder = aws_sdk_s3::Config::builder()
        .region(region_provider)
        .behavior_version_latest();

    if let (Some(ak), Some(sk)) = (access_key.as_deref(), secret_key.as_deref()) {
        let creds = aws_sdk_s3::config::Credentials::new(ak, sk, None, None, "open-terminal");
        config_builder = config_builder.credentials_provider(creds);
    }

    if let Some(ep) = endpoint {
        config_builder = config_builder
            .endpoint_url(&ep)
            .force_path_style(true);
    }

    let config = config_builder.build();
    let client = aws_sdk_s3::Client::from_conf(config);

    // Verify connection by doing a head-bucket request
    client
        .head_bucket()
        .bucket(&bucket)
        .send()
        .await
        .map_err(|e| format!("Cannot access bucket '{}': {}", bucket, e))?;

    let session_id = Uuid::new_v4().to_string();
    S3_SESSIONS.lock().insert(session_id.clone(), S3Session { client, bucket });
    Ok(session_id)
}

#[tauri::command]
pub async fn s3_list_buckets(
    region: Option<String>,
    access_key: Option<String>,
    secret_key: Option<String>,
    endpoint: Option<String>,
) -> Result<Vec<String>, String> {
    let region_provider = aws_sdk_s3::config::Region::new(
        region.unwrap_or_else(|| "us-east-1".to_string()),
    );

    let mut config_builder = aws_sdk_s3::Config::builder()
        .region(region_provider)
        .behavior_version_latest();

    if let (Some(ak), Some(sk)) = (access_key.as_deref(), secret_key.as_deref()) {
        let creds = aws_sdk_s3::config::Credentials::new(ak, sk, None, None, "open-terminal");
        config_builder = config_builder.credentials_provider(creds);
    }

    if let Some(ep) = endpoint {
        config_builder = config_builder
            .endpoint_url(&ep)
            .force_path_style(true);
    }

    let config = config_builder.build();
    let client = aws_sdk_s3::Client::from_conf(config);

    let resp = client.list_buckets().send().await.map_err(|e| e.to_string())?;
    let names: Vec<String> = resp
        .buckets()
        .iter()
        .filter_map(|b: &aws_sdk_s3::types::Bucket| b.name().map(|n| n.to_string()))
        .collect();
    Ok(names)
}

#[tauri::command]
pub async fn s3_list(s3_id: String, prefix: String) -> Result<Vec<FileEntry>, String> {
    let (client, bucket) = get_s3_client(&s3_id)?;

    let delimiter = "/";
    let resp = client
        .list_objects_v2()
        .bucket(&bucket)
        .prefix(&prefix)
        .delimiter(delimiter)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let mut entries = Vec::new();

    // Directories (common prefixes)
    for cp in resp.common_prefixes() {
        if let Some(p) = cp.prefix() {
            let name = p.strip_prefix(&prefix).unwrap_or(p);
            let name = name.trim_end_matches('/');
            if !name.is_empty() {
                entries.push(FileEntry {
                    name: name.to_string(),
                    path: p.to_string(),
                    is_dir: true,
                    size: 0,
                    modified: None,
                });
            }
        }
    }

    // Files
    for obj in resp.contents() {
        if let Some(key) = obj.key() {
            let name = key.strip_prefix(&prefix).unwrap_or(key);
            if name.is_empty() || name == "/" {
                continue;
            }
            let modified = obj.last_modified()
                .and_then(|t: &aws_sdk_s3::primitives::DateTime| {
                    t.fmt(aws_sdk_s3::primitives::DateTimeFormat::DateTime).ok()
                });
            entries.push(FileEntry {
                name: name.to_string(),
                path: key.to_string(),
                is_dir: false,
                size: obj.size().unwrap_or(0) as u64,
                modified,
            });
        }
    }

    // Sort: dirs first, then by name
    entries.sort_by(|a, b| {
        b.is_dir.cmp(&a.is_dir).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}

#[tauri::command]
pub async fn s3_download(s3_id: String, key: String) -> Result<Vec<u8>, String> {
    let (client, bucket) = get_s3_client(&s3_id)?;

    let resp = client
        .get_object()
        .bucket(&bucket)
        .key(&key)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let data = resp.body.collect().await.map_err(|e| e.to_string())?;
    Ok(data.to_vec())
}

#[tauri::command]
pub async fn s3_upload(s3_id: String, key: String, data: Vec<u8>) -> Result<(), String> {
    let (client, bucket) = get_s3_client(&s3_id)?;

    client
        .put_object()
        .bucket(&bucket)
        .key(&key)
        .body(aws_sdk_s3::primitives::ByteStream::from(data))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn s3_delete_object(s3_id: String, key: String) -> Result<(), String> {
    let (client, bucket) = get_s3_client(&s3_id)?;

    client
        .delete_object()
        .bucket(&bucket)
        .key(&key)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn s3_disconnect(s3_id: String) -> Result<(), String> {
    S3_SESSIONS.lock().remove(&s3_id);
    Ok(())
}
