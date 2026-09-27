INSERT INTO interactions(
    id,thread_id,sequence,text,created_at,completion_status,permission_profile_id
)
VALUES (-5,-1,5,'Personal presentation V4','0','profile_pending','auto');

INSERT INTO personal_presentation_versions(version_key,profile_interaction_id)
VALUES ('personal-presentation-v4',-5);
